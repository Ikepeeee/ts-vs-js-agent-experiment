# 性能検証：型注釈と型検査がAI生成コードの残存バグに与える影響

AIエージェントが書いたコードに「検証ループを通過した後も残るバグ」が、型注釈と型検査のフィードバックでどう変わるかを調べる実験の資材一式。

英語版：`README-reference-implementation.md`。正本は英語版で、食い違う場合は英語版に従う。

## フォルダ構成

| パス | 中身 | 誰が読むか |
|---|---|---|
| `README-reference-implementation_ja.md` | このファイル（英語版は `README-reference-implementation.md`） | 人間 |
| `tgit-initial-files/CLAUDE.md` | 課題用CLI「tgit」のリポジトリに置く指示書（英語） | AI |
| `for-humans/tgit-prompts.md` | tgit実装の各ステップの指示文とテスト要件（英語） | 人間が1ステップずつAIに渡す |
| `for-humans/tgit-verification_ja.md` | 各ステップの完了を自分で確かめる検証手順（日本語） | 人間 |

実験計画書（Claudeのドキュメント）：https://claude.ai/artifact/5cvSGJp8F3pThZJHPbLJ6n
（課題をGit互換CLI「tgit」に変更した点は、計画書にはまだ反映していない）

## 使い方

1. tgitのリポジトリは、**このフォルダの外**に作る（例：`~/workspace/tgit`）。
   このフォルダの中に作ると、AIが `for-humans/` の資料を読めてしまう。
2. `tgit-initial-files/CLAUDE.md` を、tgitリポジトリのルートにコピーする。
3. `for-humans/tgit-prompts.md` のステップ1の指示文を、新しい会話でAIに渡す。
4. 終わったら `for-humans/tgit-verification_ja.md` の手順で検証し、合格したら次のステップへ進む。
   ステップごとに新しい会話を使う。

## 注意

- `for-humans/` の資料はAIに見せない。先の予定（作る機能、作らない機能）が分かってしまうため。
- 実験の試行では、tgitリポジトリから `CLAUDE.md`・`docs/progress.md` などの扱いを決め直し、
  試行ごとに空のホームディレクトリと `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` で実行する。
