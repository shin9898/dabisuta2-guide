# dabisuta2-guide

『ダービースタリオン２』（Game Addict / 2026-09-24）向けの**個人攻略メモ**を、出典リンクと確認ラベル付きで公開する静的サイトです。

- ビルド: [Eleventy](https://www.11ty.dev/)（Markdown + データファイル）
- デプロイ: GitHub Actions → GitHub Pages（`main` ブランチへの push 時）

## ローカルでプレビュー

```bash
npm ci
npm run dev
```

ブラウザで `http://localhost:8080` を開きます（Eleventy の開発サーバー）。本番と同じ出力だけ確認する場合:

```bash
npm ci
npm run build
npx serve _site
```

## 最新情報（ニュース）の追加

1. `src/_data/news.json` を開く
2. 配列の**先頭**にオブジェクトを追加する（表示は日付の新しい順。同じ日付ならファイル内の並びは任意）
3. 各項目のフィールド:

| フィールド | 説明 |
| --- | --- |
| `date` | `YYYY-MM-DD`（記事・告知の日付） |
| `title` | 見出し |
| `summary` | 本文要約（**転載禁止**。自分の言葉で要約し、必ず出典へリンク） |
| `label` | `ダビスタ2で確認済み` / `前作の情報` / `ツールの計算値（ゲーム内未検証）` のいずれか |
| `sourceNote` | （任意）出典の補足（例: 公式未掲載など） |
| `sources` | `{ "url": "https://...", "title": "リンクテキスト" }` の配列。URLが無い場合は `url` を空にし、`title` を `出典要確認（…）` とする |

4. トップページの `updated` を `src/index.njk` の front matter で更新する
5. `npm run build` でエラーが無いことを確認

固定ページの本文は `src/*.md`、サイト共通設定は `src/_data/site.json` です。

## GitHub Pages を有効化する手順（公開時）

リポジトリが private の間は Pages の公開範囲に注意してください。公開準備ができたら:

1. GitHub のリポジトリ **Settings** → **Pages**
2. **Build and deployment** → **Source** を **GitHub Actions** に設定
3. `main` にマージすると `.github/workflows/pages.yml` がビルドし、`_site` をデプロイします
4. 初回デプロイ後、Pages 画面に表示される URL（例: `https://<user>.github.io/dabisuta2-guide/`）で確認

   Actions ビルドでは `ELEVENTY_PATH_PREFIX=/dabisuta2-guide/` を設定しています。リポジトリ名を変えた場合は `.github/workflows/pages.yml` も合わせて変更してください。

Workflow が失敗する場合は **Settings → Pages** で Pages が有効か、リポジトリの **Actions** タブでログを確認してください。

## コンテンツ方針（リポジトリ内ルール）

- 事実には必ず出典リンクを付ける（「〜のページによると」形式の要約）
- 各項目に確認ラベルを付ける
- 前作の情報は `src/zen.md` のみ
- 不明な値は「不明」と書く（推測しない）
- 画像の無断転載・本文の丸写しはしない

## ディレクトリ構成

```
src/
  _data/news.json      # トップの最新情報
  _data/site.json      # サイト名・公式リンク等
  _includes/           # レイアウト・マクロ
  assets/css/          # スタイル
  index.njk            # トップ
  haigo.md             # 配合
  stud.md              # 種牡馬・繁殖牝馬
  ikusei.md            # 育成・選別
  ranch.md             # 牧場施設
  bc.md                # BC・対人戦
  zen.md               # 前作の情報
```
