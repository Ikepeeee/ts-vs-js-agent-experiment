# 性能検証：TypeScriptとJavaScriptの対照実験

同じ仕様書（tgit v0.1.0〜v0.3.0）を、AIエージェントにTypeScriptとJavaScriptでそれぞれ一から実装させ、
「残ったバグ」と「かかったコスト」を比べる。違うのは言語（とそれに伴う型検査の有無）だけにする。

英語版：`README.md`。正本は英語版で、食い違う場合は英語版に従う。

## フォルダ構成

| パス | 中身 | 誰が読むか |
|---|---|---|
| `README_ja.md` | このファイル（英語版は `README.md`） | 人間 |
| `experiment-design_ja.md` | 対照実験の実験設計（英語版は `experiment-design.md`）。実行手順は13章 | 人間 |
| `main.lask` | 実験のすべての操作（lask のタスク） | 人間 |
| `spec/spec-v1.md` 〜 `spec-v3.md` | tgitの仕様書（英語）。両条件で同一 | AI（1版ずつ渡す） |
| `ts/AGENTS.md` | TypeScript条件のリポジトリに置く指示書（英語） | AI |
| `js/AGENTS.md` | JavaScript条件のリポジトリに置く指示書（英語） | AI |
| `tests/` | 公開テスト（AIに渡す）、隠しテスト、ランナー、生成器、実在リポジトリ | 人間（`tests/public/` だけはAIにも渡す） |
| `images/` | 試行と評価のコンテナイメージの定義 | 人間 |
| `eval/` | 評価のスクリプト | 人間 |
| `playground/` | 系列ごとの作業場所。エージェントのホーム（`exp-v1` が作る。コミットしない） | AI（自分の系列だけ） |
| `results/` | 試行の結果（試行ランナーが作る） | 人間 |
| `lask.json`、`lask.lock.json` | タスクが使う lask のモジュールと、lask が動かすイメージの固定 | 人間 |
| `archive/` | 対照実験に切り替える前の資材（実験設計、参照実装の指示文、検証手順） | 人間 |

`ts/AGENTS.md` と `js/AGENTS.md` の違いは、言語・型検査・実行ファイルの拡張子・開発用の依存・`typecheck` の有無だけ。
それ以外は一字一句同じ。確認するには `diff ts/AGENTS.md js/AGENTS.md`。

切り替え前の実験設計は `archive/experiment-design_ja.md`（Claudeのドキュメントから書き出したもの。元：https://claude.ai/artifact/5cvSGJp8F3pThZJHPbLJ6n）。
対照実験の実験設計は `experiment-design_ja.md`。

## 使い方

操作はすべて、このフォルダで `lask run <タスク>` を打つだけ。試行には、Claude のトークンを入れた環境変数 `CLAUDE_CODE_OAUTH_TOKEN` も要る（lask 0.13.0 と、動いている Docker が要る）。詳しくは `experiment-design_ja.md` の13章。

```sh
lask sync                       # lask が動かすイメージを取得・作成する
lask run build-images           # 試行のイメージを作る
lask run validate               # テスト自体を確かめる（約30分）
lask run freeze                 # 事前登録するハッシュを取る
lask run login                  # Claude の長期トークンを作る
export CLAUDE_CODE_OAUTH_TOKEN=<トークン>   # この行を .env に書いて source .env でもよい
lask run exp-v1 S01 --lang ts --model claude-opus-5-5   # 系列を始める：playground/S01_ts_claude-opus-5-5/ で v0.1.0
lask run exp-v2 S01             # 同じ条件で v0.2.0 を続ける
lask run exp-v3 S01             # v0.3.0
lask run evaluate S01           # 評価する。結果は results/S01_ts_claude-opus-5-5/
lask run --help                 # タスクの一覧
```

AIは、`playground/` の自分の系列のホームだけが見えるコンテナの中で動く。このフォルダのほかの資材（隠しテストなど）は見えない。
