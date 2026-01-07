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
- **Multi-Event Extraction**: Extract multiple events from a single text selection
- **Auto Timezone Detection**: Automatically uses your browser's timezone
- **Right-click Context Menu**: Create events from selected text
- **Automatic Extraction**: Intelligently extracts event details (title, time, location, etc.)
- **Draggable Modal**: Reposition the confirmation window by dragging
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
   - Multiple events? Each has its own "Add to Calendar" button
   - Drag the modal header to reposition it
4. Click "Add to Calendar" for each event you want to add

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

```
add-to-calendar/
├── background.js       # Service worker (context menu, OpenAI processing)
├── content.js          # Content script (modal UI, drag functionality)
├── manifest.json       # Extension manifest (V3)
├── popup/              # Extension popup UI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── scripts/            # Services
│   ├── supabase-client.js  # Authentication service
│   └── calendar-service.js # Calendar URL generation
├── supabase/           # Backend (Supabase Edge Functions)
│   └── functions/
│       └── process-text/   # Text processing Edge Function
├── tests/              # Playwright E2E tests
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
Calendar Event Creatorは、OpenAIの自然言語処理機能を使用して、選択したテキストからGoogle Calendarのイベントをすばやく作成できるChrome拡張機能です。Google OAuth認証とSupabase Edge Functionsによるバックエンドサービスを搭載しています。

### 機能
- **Google認証**: Googleでサインインしてシームレスな体験
- **スマート処理**: 3つの処理モード対応
  - 自分のOpenAI APIキーを使用
  - バックエンドサービス処理（サインイン時はAPIキー不要）
  - 基本フォールバック処理
- **複数イベント抽出**: 1つのテキストから複数のイベントを抽出
- **タイムゾーン自動検出**: ブラウザのタイムゾーンを自動適用
- **ドラッグ可能なモーダル**: 確認ウィンドウをドラッグで移動可能
- イベントの詳細（タイトル、時間、場所など）の自動抽出
- Google Calendarとのシームレスな統合

### インストール方法
1. このリポジトリをクローンまたはソースコードをダウンロード
2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、拡張機能のディレクトリを選択

### セットアップ

**オプション1: Googleでサインイン（推奨）**
1. Chrome上で拡張機能のアイコンをクリック
2. 「Sign in with Google」をクリック
3. 拡張機能を認証
4. イベント作成開始（APIキー不要！）

**オプション2: 自分のAPIキーを使用**
1. Chrome上で拡張機能のアイコンをクリック
2. 設定でOpenAI APIキーを入力
3. 「保存」をクリックしてAPIキーを保存

### 使用方法
1. ウェブページ上でイベント情報を含むテキストを選択
2. 右クリックして「Add to Google Calendar」を選択
3. 確認モーダルで抽出されたイベントの詳細を確認
   - 複数イベントの場合、各イベントに「Add to Calendar」ボタンが表示
   - モーダルヘッダーをドラッグして位置を移動可能
4. 追加したいイベントの「Add to Calendar」をクリック

### 技術要件
- Chromeブラウザ（最新版推奨）
- Googleアカウント（認証用、オプション）
- OpenAI APIキー（バックエンドサービス未使用時のみ必要）
- インターネット接続

### 注意事項
- OpenAIのGPT-4.1-miniモデルを使用してテキストを処理
- APIキーはChromeの同期ストレージに安全に保存（Chrome暗号化）
- バックエンド処理でAPIキーのプライバシーを保護
- 認証セッションはブラウザ再起動後も維持

---

<a id="chinese"></a>
## 中文

### 概述
Calendar Event Creator 是一个 Chrome 扩展程序，它使用 OpenAI 的自然语言处理功能，帮助您快速从选定文本创建 Google 日历事件。现已支持 Google OAuth 认证和 Supabase Edge Functions 后端服务。

### 特点
- **Google 认证**: 使用 Google 登录，享受无缝体验
- **智能处理**: 三种处理模式
  - 使用您自己的 OpenAI API 密钥
  - 后端服务处理（登录后无需 API 密钥）
  - 基本回退处理
- **多事件提取**: 从一段文本中提取多个事件
- **时区自动检测**: 自动使用浏览器时区
- **可拖动弹窗**: 可通过拖动移动确认窗口
- 自动提取事件详情（标题、时间、地点等）
- 与 Google 日历无缝集成

### 安装步骤
1. 克隆此仓库或下载源代码
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"并选择扩展程序目录

### 设置

**方式一：使用 Google 登录（推荐）**
1. 点击 Chrome 中的扩展图标
2. 点击"Sign in with Google"
3. 授权扩展程序
4. 开始创建事件（无需 API 密钥！）

**方式二：使用自己的 API 密钥**
1. 点击 Chrome 中的扩展图标
2. 在设置中输入您的 OpenAI API 密钥
3. 点击"保存"存储您的 API 密钥

### 使用方法
1. 在任意网页上选择包含事件信息的文本
2. 右键点击并选择"Add to Google Calendar"
3. 在确认窗口中检查提取的事件详情
   - 多个事件时，每个事件都有独立的"Add to Calendar"按钮
   - 可拖动弹窗标题栏移动位置
4. 点击要添加的事件的"Add to Calendar"按钮

### 技术要求
- Chrome 浏览器（建议使用最新版本）
- Google 账户（用于认证，可选）
- OpenAI API 密钥（不使用后端服务时需要）
- 活跃的互联网连接

### 注意事项
- 扩展程序使用 OpenAI 的 GPT-4.1-mini 模型处理文本
- API 密钥安全存储在 Chrome 的同步存储中（由 Chrome 加密）
- 后端处理保护您的 API 密钥隐私
- 认证会话在浏览器重启后保持有效