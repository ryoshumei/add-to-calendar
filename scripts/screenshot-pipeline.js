// scripts/screenshot-pipeline.js
// Turns a captured tab into the Screenshot that leaves the browser.
//
// The service worker has no DOM, so this uses only APIs a worker also has:
// fetch for the data URL, createImageBitmap to decode, OffscreenCanvas to
// draw and encode. That also lets a test run it in a page context.
//
// Wrapped so that SCREENSHOT_PIPELINE is the only name it adds to the service
// worker's shared global scope.
(function () {
    const SCREENSHOT_PIPELINE = {
        // The longest side of the Screenshot that is sent for Extraction.
        MAX_EDGE_PX: 1600,
        JPEG_QUALITY: 0.7,
        // The cap on the data URL that is sent — base64 and all, since that
        // is what crosses the wire. A Screenshot this large never survives
        // the downscale above, so passing it on would mean something went
        // wrong; the Extraction is refused instead.
        MAX_ENCODED_BYTES: 10 * 1024 * 1024,

        /**
         * Build the Screenshot to send for Extraction: the Region of the
         * capture, downscaled so its longest side is at most MAX_EDGE_PX,
         * encoded as JPEG.
         *
         * @param {string} captureDataUrl - Data URL of the captured visible tab
         * @param {?{x: number, y: number, width: number, height: number}} region -
         *   The Region in CSS pixels, or null for the whole visible tab
         * @param {number} devicePixelRatio - Device pixels per CSS pixel
         * @param {{maxEdgePx?: number, quality?: number, maxEncodedBytes?: number}} [options]
         * @returns {Promise<string>} JPEG data URL
         */
        async buildScreenshotDataUrl(captureDataUrl, region, devicePixelRatio, options = {}) {
            const maxEdgePx = options.maxEdgePx ?? this.MAX_EDGE_PX;
            const quality = options.quality ?? this.JPEG_QUALITY;
            const maxEncodedBytes = options.maxEncodedBytes ?? this.MAX_ENCODED_BYTES;

            const capture = await createImageBitmap(await (await fetch(captureDataUrl)).blob());

            try {
                const deviceRegion = toCaptureRect(region, devicePixelRatio, capture);
                const scale = Math.min(
                    1,
                    maxEdgePx / Math.max(deviceRegion.width, deviceRegion.height)
                );
                const width = Math.max(1, Math.round(deviceRegion.width * scale));
                const height = Math.max(1, Math.round(deviceRegion.height * scale));

                const canvas = new OffscreenCanvas(width, height);
                canvas.getContext('2d').drawImage(
                    capture,
                    deviceRegion.x, deviceRegion.y, deviceRegion.width, deviceRegion.height,
                    0, 0, width, height
                );

                const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
                const dataUrl = await blobToDataUrl(blob);

                // Measured on the data URL rather than the blob behind it:
                // base64 makes it about a third larger, and the data URL is
                // what is sent.
                if (dataUrl.length > maxEncodedBytes) {
                    throw new Error('The Screenshot is too large to send.');
                }
                return dataUrl;
            } finally {
                capture.close();
            }
        }
    };

    // The Region is in CSS pixels and the capture is in device pixels, so on a
    // Retina display the Region has to be scaled up to land on the same
    // content. No Region means the whole visible tab.
    //
    // A Region dragged past the edge of the window is kept inside the capture:
    // beyond the edge there is nothing to crop, and drawing it anyway would put
    // a black band in the Screenshot.
    function toCaptureRect(region, devicePixelRatio, capture) {
        if (!region) {
            return { x: 0, y: 0, width: capture.width, height: capture.height };
        }

        const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
        const left = clamp(Math.round(region.x * ratio), 0, capture.width - 1);
        const top = clamp(Math.round(region.y * ratio), 0, capture.height - 1);
        const right = clamp(Math.round((region.x + region.width) * ratio), left + 1, capture.width);
        const bottom = clamp(Math.round((region.y + region.height) * ratio), top + 1, capture.height);

        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    function clamp(value, lowest, highest) {
        return Math.min(Math.max(value, lowest), highest);
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read the encoded Screenshot'));
            reader.readAsDataURL(blob);
        });
    }

    // Export for use in other scripts
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SCREENSHOT_PIPELINE };
    } else if (typeof self !== 'undefined') {
        // Service Worker environment
        self.SCREENSHOT_PIPELINE = SCREENSHOT_PIPELINE;
    } else if (typeof window !== 'undefined') {
        // Browser environment
        window.SCREENSHOT_PIPELINE = SCREENSHOT_PIPELINE;
    }
})();
