# テスト一式

英語版：`README.md`。正本は英語版で、食い違う場合は英語版に従う。

実験設計6章のテストを置く場所。エージェントには、`public/` の公開テストだけを渡す。それ以外は試行のコンテナに入れない。

## 構成

| パス | 内容 |
|---|---|
| `src/` | 手書きシナリオの元（`v1.mjs`〜`v3.mjs`）と、JSONを作る `build.mjs` |
| `public/vN/` | 公開テスト（v0.1.0 16件、v0.2.0 8件、v0.3.0 8件）。仕様1章の形式だけを使う |
| `hidden/vN/` | 隠しシナリオ（82件、35件、36件）。`manifest.json` に節と「基本」「境界」の区別 |
| `random/gen.mjs` | 無作為な差分テストの生成器（隠しテストの2）。エージェントにも写しを渡す（隠しテストの種は渡さない） |
| `runner/run.mjs` | シナリオを本物のgitとtgitで実行して比べるランナー。エージェントにも写しを渡す |
| `runner/fake-tgit.mjs` | ランナーの自己テスト用の、わざと壊したtgit |

## 使い方

```sh
# シナリオのJSONを作り直す（src/ を変えたとき）
node tests/src/build.mjs

# 試行の評価：v0.2.0 なら v1 と v2 の隠しシナリオを回す
node tests/runner/run.mjs --tgit '["node","<repo>/src/main.ts"]' --json out.json tests/hidden/v1 tests/hidden/v2

# 無作為な差分テスト：生成してから同じランナーで回す
node tests/random/gen.mjs --version v2 --seed 20261029 --out /tmp/random-v2
node tests/runner/run.mjs --tgit '["node","<repo>/src/main.ts"]' --json random.json /tmp/random-v2
```

試行で `given/` に置くのは、その版までの `public/` をまとめたもの（v0.2.0 なら `public/v1` と `public/v2`）。`manifest.json` は入れない。v0.1.0 では、`runner/run.mjs` と `random/gen.mjs` も `test/difftest/tools/` に置く。

## テスト自体の確認

`--tgit git` を渡すと、両側で本物のgitを動かす。正しいテストなら全件が通る。

```sh
node tests/runner/run.mjs --tgit git --strict tests/hidden tests/.validate   # 期待する終了コードも確かめる
node tests/runner/run.mjs --tgit git tests/public
```

`--strict` は、失敗を想定していない `run` ステップで本物のgitが失敗したら、シナリオの誤りとして報告する。失敗を想定するステップには `expectExit` を書く（公開テストからは `build.mjs` が取り除く。`.validate/` はその前の写し）。

ランナーが差を見逃さないことは、`runner/fake-tgit.mjs`（何も出力せず、指定の終了コードで終わる）で確かめる。

## 比べるもの

`run` ステップごとに、終了コード、`matchOutput` があれば標準出力（一時ディレクトリのパスは `<ROOT>` に置き換える）、リポジトリの状態を比べる。状態は両側とも本物のgitで調べる：HEAD、refs、オブジェクトの集合、`config --local --list`、インデックス（`ls-files -s`）、`fsck --strict` の結果、`MERGE_HEAD`・`MERGE_MSG`・`CHERRY_PICK_HEAD`・`packed-refs` の中身、作業ツリーのファイル（内容、実行ビット、シンボリックリンク）。

reflog（`.git/logs/`）は状態に含めない。v0.2.0 までのtgitは書かないため。v0.3.0では `reflog` コマンドの出力で確かめる。

## 固定した環境

両側とも、専用の `HOME`（`.gitconfig` に `init.defaultBranch=main` と `core.autocrlf=false`）、`GIT_CONFIG_NOSYSTEM=1`、`TZ=UTC`、`LANG=C`、作者とコミッターの名前・メール・日時（`runner/run.mjs` の `FIXED_ENV`）で動かす。`AGENTS.md` の「Fixed environment」と同じ設定。

## 凍結の前にすること

1. 実験フォルダーの直下で `lask run validate` を実行する。評価のイメージ（Linux、試行と同じgitのバージョン）の中で、上の「テスト自体の確認」と、無作為な差分テスト全件（各版2,000件）の確認をまとめて流す。
2. `lask run freeze` でハッシュを取り、事前登録する。対象は `public/` と `hidden/` の全ファイル、`random/gen.mjs` と種（`20261029`）と生成結果、`runner/run.mjs` ほか（実験設計 13.1）。
