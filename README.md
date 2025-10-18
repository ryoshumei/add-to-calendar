# Calendar Event Creator Chrome Extension

[English](#english) | [日本語](#japanese) | [中文](#chinese)

<a id="english"></a>
## English

### Overview
Calendar Event Creator is a Chrome extension that helps you quickly create Google Calendar events from selected text using OpenAI's natural language processing capabilities. The extension now features Google OAuth authentication and a backend service powered by Supabase Edge Functions.

### Features
- **Google Authentication**: Sign in with Google for seamless experience
- **Smart Event Processing**: Three processing modes:
  - Use your own OpenAI API key (if provided)
  - Backend service processing (no API key needed when signed in)
  - Basic fallback event creation
- **Right-click Context Menu**: Create events from selected text
- **Automatic Extraction**: Intelligently extracts event details (title, time, location, etc.)
- **Quick Preview**: Review and confirm before adding to calendar
- **Seamless Integration**: Direct integration with Google Calendar

### Installation
1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

### Setup

**Option 1: Sign in with Google (Recommended)**
1. Click the extension icon in Chrome
2. Click "Sign in with Google"
3. Authorize the extension
4. Start creating events (no API key needed!)

**Option 2: Use Your Own API Key**
1. Click the extension icon in Chrome
2. Enter your OpenAI API key in the settings
3. Click "Save" to store your API key
4. (Optional) Sign in with Google for additional features

### Usage
1. Select text containing event information on any webpage (e.g., "Team meeting tomorrow at 2pm")
2. Right-click and select "Add to Google Calendar"
3. Review the extracted event details in the confirmation modal
4. Click "Add to Calendar" to create the event

The extension intelligently chooses the best processing method:
- If you set an API key → Uses your key
- If you're signed in → Uses our backend service
- Otherwise → Creates a basic event

### Technical Requirements
- Chrome Browser (Latest version recommended)
- Google Account (for authentication, optional)
- OpenAI API key (optional, if not using backend service)
- Active internet connection

### Architecture

This project follows a **monorepo structure**:

```
add-to-calendar/
├── extension/          # Chrome extension code
│   ├── background.js   # Service worker
│   ├── content.js      # Content script
│   ├── popup/          # Extension popup UI
│   └── scripts/        # Authentication & calendar services
├── supabase/           # Backend (Supabase Edge Functions)
│   └── functions/
│       └── process-text/  # Text processing Edge Function
├── shared/             # Shared TypeScript types
├── tests/              # Playwright E2E tests
├── .github/workflows/  # CI/CD pipelines
└── docs/               # Documentation
```

**Backend Service**: Powered by Supabase Edge Functions
- Processes text using OpenAI API
- No client-side API key needed
- Serverless, auto-scaling architecture

**Authentication**: Google OAuth via Supabase
- Managed by Chrome Identity API
- Session persistence across extension restarts
- Secure token handling

### Processing Priority

1. **User's API Key** (if set): Uses client-side processing with your OpenAI key
2. **Backend Service** (if authenticated): Uses our backend for processing
3. **Basic Fallback**: Creates simple events without AI processing

### Notes
- The extension processes text using OpenAI's GPT-4.1-mini model
- API keys are stored securely in Chrome's sync storage (encrypted by Chrome)
- Backend processing keeps your API usage private
- Authentication sessions persist across browser restarts
- All processing is done server-side or client-side (no data retention)

### Developer Documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - Backend and extension deployment
- [Backend Implementation](docs/BACKEND_IMPLEMENTATION.md) - Edge Function details
- [CLAUDE.md](CLAUDE.md) - Project instructions for Claude Code

---

<a id="japanese"></a>
## 日本語

### 概要
Calendar Event Creatorは、OpenAIの自然言語処理機能を使用して、選択したテキストからGoogle Calendarのイベントをすばやく作成できるChrome拡張機能です。

### 機能
- 選択したテキストを右クリックしてカレンダーイベントを作成
- イベントの詳細（タイトル、時間、場所など）の自動抽出
- カレンダーに追加する前のプレビューと確認
- Google Calendarとのシームレスな統合

### インストール方法
1. このリポジトリをクローンまたはソースコードをダウンロード
2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、拡張機能のディレクトリを選択

### セットアップ
1. Chrome上で拡張機能のアイコンをクリック
2. 設定でOpenAI APIキーを入力
3. 「保存」をクリックしてAPIキーを保存

### 使用方法
1. ウェブページ上でイベント情報を含むテキストを選択
2. 右クリックして「Add to Google Calendar」を選択
3. 確認モーダルで抽出されたイベントの詳細を確認
4. 「Add to Calendar」をクリックしてイベントを作成

### 技術要件
- Chromeブラウザ（最新版推奨）
- 有効なOpenAI APIキー
- インターネット接続

### 注意事項
- OpenAIのGPT-4.1-miniモデルを使用してテキストを処理
- APIキーはChromeのローカルストレージに安全に保存
- プライバシーのため、すべてのデータ処理はクライアントサイドで実行

---

<a id="chinese"></a>
## 中文

### 概述
Calendar Event Creator 是一个 Chrome 扩展程序，它使用 OpenAI 的自然语言处理功能，帮助您快速从选定文本创建 Google 日历事件。

### 特点
- 右键点击选中文本即可创建日历事件
- 自动提取事件详情（标题、时间、地点等）
- 添加到日历前可预览和确认
- 与 Google 日历无缝集成

### 安装步骤
1. 克隆此仓库或下载源代码
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"并选择扩展程序目录

### 设置
1. 点击 Chrome 中的扩展图标
2. 在设置中输入您的 OpenAI API 密钥
3. 点击"保存"存储您的 API 密钥

### 使用方法
1. 在任意网页上选择包含事件信息的文本
2. 右键点击并选择"Add to Google Calendar"
3. 在确认窗口中检查提取的事件详情
4. 点击"Add to Calendar"创建事件

### 技术要求
- Chrome 浏览器（建议使用最新版本）
- 有效的 OpenAI API 密钥
- 活跃的互联网连接

### 注意事项
- 扩展程序使用 OpenAI 的 GPT-4.1-mini 模型处理文本
- API 密钥安全存储在 Chrome 的本地存储中
- 所有数据处理都在客户端进行，保护隐私