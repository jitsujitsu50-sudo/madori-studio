# 間取りスタジオ — 共同開発ルール（Claude / ChatGPT Codex 共通）

このリポジトリは Claude と ChatGPT(Codex) の両方が編集します。どちらのAIも作業前にこのファイルを読んでください。

## 正（source of truth）
- **GitHub: `jitsujitsu50-sudo/madori-studio` の `main` ブランチ** が唯一の正です。
- 作業開始時: `git status` と `git pull`（または fetch）で最新化し、HEAD を確認する。
- 作業終了時: コミットして `main` へ push する。push すると GitHub Pages が自動で公開される。
- ユーザーの未コミット変更や、ブラウザの localStorage データを壊さないこと。

## 公開先
1. **GitHub Pages（メイン・無料）**: https://jitsujitsu50-sudo.github.io/madori-studio/
   - `.github/workflows/pages.yml` が `main` への push ごとに `dist/` を公開する。
2. **ChatGPT Sites（任意）**: https://madori-studio-20261012.jitsujitsu50.chatgpt.site/
   - project_id: `appgprj_6accd181fb188191acfe57a19ce866f4`（`.openai/hosting.json`）
   - 公開設定は **public を必ず維持**。Codex にクレジットがある時だけ使う。
   - Sites の git remote は `origin`、GitHub は `github` という名前で登録している（Mac のローカルリポジトリ）。

## 構成
- 静的サイト。ビルド不要。公開対象は `dist/` のみ。
- `dist/index.html` — UI。CSS/JS は `?v=番号` でキャッシュ対策。**変更したら番号を上げる**（現在 v27）。
- `dist/app.js` — 2D間取り編集。`items`（部屋・壁・建具・家具）と `floorTiles` を管理。
- `dist/builder3d.js` — 3Dルームビルダー（three.js / WebGL）。編集ツール・ホットバー・ゴースト表示・ウォークモード。
- `dist/b3assets.js` — 3D素材（手続き生成テクスチャ、環境光、家具/建具モデル、効果音）。`builder3d.js` より先に読み込む。
- `dist/vendor/three.min.js` — three.js r160.1（同梱。外部CDN不使用）。
- `dist/styles.css`

## データ設計（壊さないこと）
- localStorage `madori-data`: `{items, floorTiles, hiddenEdges, wallPaint, name, grid, tatami, dataVersion}`
  - 項目の追加は「後方互換で追加のみ」。古いデータ（hiddenEdges なし）も読めること。
- localStorage `madori-wall-height`: 壁高(cm)。`madori-underlay`: 下絵画像。`madori-sound`: 効果音 on/off。
- 座標は plan px（`PX=80` px = 1m）。3D は meter 単位（plan px / PX）。plan x → 3D X, plan y → 3D Z。
- `floorTiles` は 2D/3D 共有。3D 床はグリッド座標 `gx = round(x/size)` に正規化。
- 自動壁: 4方向連結で4マス以上の床群の外周 + 部屋(rotation≈0)の間仕切り。3Dで消した自動壁は `hiddenEdges`（キー `h|v:x:y:size`、plan px）。
- 3Dで追加した壁は 2D の `type:'wall'` アイテム（`from3d:true`、直線上で自動結合）。壁色は `wallColor`。
- 床マスの床材は `floorTiles[].mat`（oak/walnut/whiteoak/tile/marble/tatami/carpet/mortar）。`mat` なしの古いデータは `color` で着色した木目で表示。2Dで色を塗り直すと `mat` は消える。
- 自動壁の壁色は `wallPaint`（キー = hiddenEdges と同じ辺キー → 色）。
- 家具の3D形状は名前で決まる（`B3A.kind`: ベッド/ソファ/キッチン/テレビ/テーブル/デスク/椅子/植物/ラグ/収納）。
- ドア・窓は 2D の opening アイテム（door は item の下辺が壁線）。

## 変更後の確認（必須）
1. `node --check dist/app.js && node --check dist/b3assets.js && node --check dist/builder3d.js`
2. 実ブラウザで操作確認（3D: 床ドラッグ・壁・ドア/窓・家具移動・視点、2D同期、リロード後の保存）
3. index.html のバージョン番号を上げてコミット → `main` に push

## 履歴メモ
- v25: Sites 公開済み（canvas 2D のアイソメ表示）
- v26: three.js 化、床ドラッグ塗り、3D壁編集、ドア/窓、家具移動、カメラ回転/ズーム、タッチ対応
- v27: ゲーム風UI（ホットバー1〜9キー、ゴースト表示、ポップ演出、効果音）、床材テクスチャ、壁塗り、幅木、建具部分の壁くり抜き、詳細な家具モデル、一人称ウォークモード（衝突判定・タッチスティック）

## 既知の課題
- スマホでは2D画面のツールバーが約514px幅あり、ページ全体が縮小表示される（3D画面は問題なし）。2Dのスマホ用レイアウト見直しが必要。
