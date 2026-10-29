# tgit 検証手順（自分用・リポジトリには置かない）

英語版：`tgit-verification.md`。正本は英語版で、食い違う場合は英語版に従う。

各ステップが終わったときに、AIの「完了しました」という報告を信用せず、自分の手で確かめるための手順。AIの作業場所とは別の場所で、毎回同じ順番で行う。

- 「1. 毎ステップ共通の検証」は、すべてのステップで行う
- 「2. ステップごとの確認」は、そのステップで増えた機能を、テストとは別の角度から手で触って確かめる
- 結果は「3. 検証記録」に残す。次のステップの検証では、前回の記録にあるコミットとの差分を見る

---

## 0. 準備（最初に1回だけ）

```bash
# 検証用の場所を、AIの作業場所とは別に作る
mkdir -p ~/verify && cd ~/verify
git clone <tgitのリポジトリ> tgit

# tgit を短い名前で呼べるようにする（シェルを開くたびに実行）
# alias ではなく関数にしておくと、ループや <( ) の中でも確実に使える
tgit() { node ~/verify/tgit/src/main.ts "$@"; }

# 比較用に、作者と日時を固定する（シェルを開くたびに実行）
export GIT_AUTHOR_NAME=Test GIT_AUTHOR_EMAIL=test@example.com GIT_AUTHOR_DATE="1767225600 +0000"
export GIT_COMMITTER_NAME=Test GIT_COMMITTER_EMAIL=test@example.com GIT_COMMITTER_DATE="1767225600 +0000"
export TZ=UTC LANG=C
```

- `git --version` の結果が、`docs/notes/environment.md` に記録されたバージョンと同じか確かめる。違う場合は、どちらかに揃えてから検証する
- Node.jsのバージョンが `.nvmrc` と同じか確かめる（`node --version`）

---

## 1. 毎ステップ共通の検証

### 1-1. 最新の状態を、まっさらな環境で用意する

```bash
cd ~/verify/tgit
git fetch && git checkout <検証するブランチ> && git pull
git status                         # 変更が残っていないこと
rm -rf node_modules && npm ci      # 依存を入れ直す
```

### 1-2. 4つのコマンドを自分で実行する

```bash
npm test && npm run difftest && npm run typecheck && npm run lint
echo "結果: $?"                    # 0 であること
```

1つでも失敗したら、その時点で不合格。

### 1-3. 乱数の種を変えて差分テストを回す

AIが確かめたのとは違う種で回し、特定の種にだけ合わせた実装になっていないかを見る。

```bash
for i in 1 2 3; do
  DIFFTEST_SEED=$RANDOM DIFFTEST_RUNS=2000 npm run difftest || echo "失敗（種は上の出力を参照）"
done
```

- 使った種を検証記録に残す
- 失敗したら、表示された種と最小化された再現例を控える

### 1-4. テストが弱められていないか確かめる

```bash
PREV=<前回検証したコミット>        # 初回はリポジトリの最初のコミット

# テストの変更の一覧
git diff --stat $PREV HEAD -- test/

# 削除された行だけを見る（期待値の書き換えや、テストの削除がないか）
git diff $PREV HEAD -- test/ | grep '^-' | grep -v '^---'

# 実行を飛ばす書き方が入っていないか
grep -rnE "\.skip|\.only|\.todo|skip:|todo:" test/

# 手書きシナリオの数が減っていないか（前回の記録と比べる）
ls test/difftest/scenarios | wc -l
```

- 削除行に、期待値やシナリオの中身が含まれていたら、理由を確認する。理由がなければ差し戻す
- **テストが本当に効いているかを自分で確かめる：** 作業用のブランチで実装を1か所わざと壊し（たとえば、出力の文字を1つ変える）、`npm run difftest` が失敗することを確認する。確認したらブランチごと捨てる

```bash
git switch -c verify-break
# src/ の中の、今回のステップで追加された出力を1文字変える
npm run difftest   # 失敗すること
git switch - && git branch -D verify-break
```

### 1-5. テストのためだけの分岐がないか確かめる

```bash
# 実装が読んでいる環境変数の一覧
grep -rn "process.env" src/

# テストを意識した名前が実装に入っていないか
grep -rniE "difftest|DIFFTEST|NODE_ENV|\bCI\b|fast-check" src/
```

- `GIT_AUTHOR_*`、`GIT_COMMITTER_*`、`HOME`、`TZ` のように本物のgitも読む環境変数は問題ない
- テストの実行中かどうかで動きを変えるものがあれば差し戻す

### 1-6. 技術的な制約を守っているか確かめる

```bash
# 実行時の依存がないこと（何も表示されないか、{} であること）
node -e "console.log(require('./package.json').dependencies ?? '')"

# 開発用の依存が決めた5つだけであること
node -e "console.log(Object.keys(require('./package.json').devDependencies))"

# 型を消すだけでは動かない構文や、any が使われていないか
grep -rnE "\benum\b|\bnamespace\b|import .* = require|: any\b|as any|<any>" src/

# tsconfig の設定
grep -nE "erasableSyntaxOnly|verbatimModuleSyntax|\"strict\"|noUncheckedIndexedAccess" tsconfig.json

# ビルドなしで直接動くこと
node src/main.ts init /tmp/tgit-smoke && rm -rf /tmp/tgit-smoke
```

### 1-7. 構造の決まりを守っているか確かめる

```bash
# コマンド同士が直接importしていないか（registry.ts 以外で、commands/ 内のファイルを読んでいないか）
grep -rnE "from '\./|from \"\./" src/commands/ | grep -v registry.ts

# 共通処理がコマンドやCLIに依存していないか
grep -rnE "commands/|cli/" src/core/
```

### 1-8. 頼んでいない機能が入っていないか確かめる

```bash
# 登録されているコマンドの一覧（そのステップまでに頼んだものだけか）
cat src/commands/registry.ts

# 実験に取っておく機能や、範囲外の機能の気配がないか
grep -rniE "sha-?256|object-format|\bmv\b|remote|fetch|push|clone|submodule|worktree add" src/
```

- `mv`、SHA-256、リモート操作に関するものが見つかったら、すぐに止めて取り除かせる

### 1-9. 記録とコミットを確かめる

```bash
git log --oneline $PREV..HEAD        # 小さな単位か、英語の1行か
git diff $PREV HEAD -- docs/         # progress.md と notes/ が更新されているか
```

- `docs/progress.md` に、できたことと、本物のgitとの既知の差が書かれているか
- `docs/notes/` に、調べた挙動のメモがあるか（指示文で調査を求めたステップでは必須）

### 1-10. 手で触って確かめる

「2. ステップごとの確認」の該当ステップを行う。

### 1-11. 合否の判定と、差し戻し方

1-2〜1-10 がすべて問題なければ合格。不合格のときは、**直し方は伝えず、事実だけを渡す**。新しい会話で、次のような文面を使う。

```text
The following problem was found in commit <hash>.

<失敗したシナリオ、または手順と、本物のgitとtgitの出力の違いをそのまま貼る>
(Seed: <種>, runs: <回数>)

Fix the implementation so that this case matches the real git. Do not change existing tests.
Add this case as a new scenario.
```

テストが弱められていた場合は、その差分を示して元に戻させる。

---

## 2. ステップごとの確認

### 実データ用のリポジトリを用意する（ステップ2〜6で使う）

tgit自身の開発履歴を、本物のデータとして使う。ステップ6まではtgitがpackfileを読めないので、オブジェクトをすべてloose objectに展開しておく。

```bash
cd ~/verify && rm -rf self
git clone ~/verify/tgit self && cd self
mkdir -p ../packs && mv .git/objects/pack/pack-* ../packs/ 2>/dev/null
for p in ../packs/*.pack; do [ -e "$p" ] && git unpack-objects -q < "$p"; done
rm -rf ../packs
git fsck                            # エラーがないこと
```

各ステップの検証の前に、このリポジトリを作り直す（tgitの履歴が増えているため）。

### ステップ1：基盤と `init`

```bash
cd /tmp && rm -rf a b
tgit init a; git init b
# 設定が同じか
diff <(git -C a config --local --list) <(git -C b config --local --list) && echo 一致

# tgitが作ったリポジトリを、本物のgitで使えるか
cd a && git commit --allow-empty -m test && git log --oneline && git fsck --strict; cd ..

# 未知のコマンドの終了コード
tgit nosuchcommand; echo $?; git nosuchcommand; echo $?
```

- 差分テストの自己テスト（壊れたtgitで差が出ることを確かめるテスト）が存在し、`npm test` で実行されているか、名前で確認する

### ステップ2：オブジェクトの読み書き

```bash
# ハッシュが一致するか（テキスト、空、バイナリ）
printf 'hello\n' | git hash-object --stdin; printf 'hello\n' | tgit hash-object --stdin
: > empty;          git hash-object empty;  tgit hash-object empty
head -c 2000000 /dev/urandom > r.bin; git hash-object r.bin; tgit hash-object r.bin

# 実データの全オブジェクトを、本物とtgitで読み比べる
cd ~/verify/self
for o in $(git rev-list --objects --all | cut -d' ' -f1); do
  cmp -s <(git cat-file -p "$o") <(tgit cat-file -p "$o") || echo "差: $o"
done
echo 完了                            # 「差:」が1行も出ないこと
```

### ステップ3：インデックスと作業ツリー

```bash
cd /tmp && rm -rf s && git init -q s && cd s
cp -r ~/verify/tgit/src . && git add . && git commit -qm base

# 色々な状態を手で作る
echo x >> src/main.ts                     # 変更
echo y > "新しい ファイル.txt"             # 未追跡（空白と日本語）
git rm -q --cached src/cli/*.ts 2>/dev/null # ステージ済みの削除
mkdir -p tmp && echo z > tmp/a.log && echo "*.log" > .gitignore

# status と ls-files を比べる
diff <(git status --porcelain) <(tgit status --porcelain) && echo status一致
diff <(git ls-files -s) <(tgit ls-files -s) && echo ls-files一致
diff <(git ls-files -o --exclude-standard) <(tgit ls-files -o --exclude-standard) && echo ignore一致

# tgitで add したインデックスを、本物のgitが読めるか
tgit add -A && git status --porcelain && git fsck
```

### ステップ4：コミットと履歴（v0.1.0）

同じ操作を本物のgitとtgitで行い、コミットのハッシュまで一致するかを見る。

```bash
cd /tmp && rm -rf g t && mkdir g t
for side in g t; do
  cd /tmp/$side
  if [ $side = g ]; then G="git"; else G="tgit"; fi
  {
    $G init .
    echo 1 > a.txt && $G add a.txt && $G commit -m one
    $G switch -c feature && echo 2 >> a.txt && $G commit -a -m two
    $G switch main && echo 3 > b.txt && $G add . && $G commit -m three
    $G tag v1 && $G reset --hard HEAD~1
  } > /dev/null
done
diff <(git -C /tmp/g log --all --format='%H %s') <(git -C /tmp/t log --all --format='%H %s') && echo 履歴一致
git -C /tmp/t fsck --strict

# 実データで log と rev-parse を比べる
cd ~/verify/self
H=$(git rev-parse HEAD)
diff <(git log --format='%H %an %ad %s' $H) <(tgit log --format='%H %an %ad %s' $H) && echo log一致
diff <(git rev-parse $H~5 $H^ ) <(tgit rev-parse $H~5 $H^) && echo rev-parse一致
```

- リリースの確認：`git tag -l` に `v0.1.0` があること。1-3 は `DIFFTEST_RUNS=1000` 以上で行う

### ステップ5：差分と設定

実データのコミットごとの差分を、本物と比べる。差分の位置の決め方の違いは、作られたテストより実際のコードの変更で見つかりやすい。

```bash
cd ~/verify/self
for c in $(git rev-list --no-merges -n 50 HEAD); do
  git rev-parse -q --verify "$c^" >/dev/null || continue     # 最初のコミットは飛ばす
  cmp -s <(git diff "$c^" "$c") <(tgit diff "$c^" "$c") || echo "diff差: $c"
  cmp -s <(COLUMNS=80 git diff --stat "$c^" "$c") <(COLUMNS=80 tgit diff --stat "$c^" "$c") || echo "stat差: $c"
  cmp -s <(git show "$c") <(tgit show "$c") || echo "show差: $c"
done
echo 完了

# 設定：tgitで書いた設定を本物が読めるか
tgit config user.name "Verify User" && git config --get user.name
```

- 差が出たら、`diff <(git diff X^ X) <(tgit diff X^ X)` で中身を見て、差し戻しの文面に貼る

### ステップ6：マージ（v0.2.0）

```bash
cd /tmp && rm -rf m && git init -q m && cd m
printf '1\n2\n3\n' > f && git add f && git commit -qm base
git switch -qc other && printf '1\nOTHER\n3\n' > f && git commit -qam other
git switch -q main && printf '1\nMAIN\n3\n' > f && git commit -qam main

# 本物で一度マージしてコンフリクトの状態を控え、戻してからtgitでも同じことをする
git merge other > ../real.out; cp f ../real.f; git ls-files -s > ../real.idx; git merge --abort
tgit merge other > ../tgit.out; echo "終了コード: $?"
diff ../real.f f && diff ../real.idx <(git ls-files -s) && echo コンフリクト状態一致
cat f                                       # マーカーを目で確認
tgit merge --abort && git status --porcelain   # 元に戻っていること

# マージ結果を本物のgitで検査
echo resolved > f && git add f && tgit commit -m merged > /dev/null && git log --graph --oneline && git fsck --strict

# stash の一覧
echo w >> f && tgit stash push && diff <(git stash list) <(tgit stash list) && echo stash一致
```

- リリースの確認：`v0.2.0` タグがあること

### ステップ7：履歴の書き換えと内部形式（v0.3.0）

本物の、packfileで圧縮されたリポジトリで、読み取り系のコマンドを比べる。ここから先は、実データ用のリポジトリを展開しなくてよい。

```bash
cd ~/verify && rm -rf real
git clone <ある程度の大きさのOSSのリポジトリ（数千コミット程度）> real && cd real
git gc -q

H=$(git rev-parse HEAD)
diff <(git log --format='%H %s' -n 2000) <(tgit log --format='%H %s' -n 2000) && echo log一致
diff <(git branch) <(tgit branch) && echo branch一致
diff <(git tag -l) <(tgit tag -l) && echo tag一致     # タグの多くは packed-refs に入っている
diff <(git diff --stat $H~20 $H) <(tgit diff --stat $H~20 $H) && echo diff一致
diff <(git status --porcelain) <(tgit status --porcelain) && echo status一致

# REF_DELTA を使った形でも同じことを確かめる
git -c repack.useDeltaBaseOffset=false repack -a -d -f -q
diff <(git log --format='%H %s' -n 2000) <(tgit log --format='%H %s' -n 2000) && echo REF_DELTAでも一致
```

```bash
# rebase：本物とtgitで同じ操作をして、結果のハッシュを比べる（ステップ4の書き方を流用する）
#   main と feature を分岐させ、feature を main の上に rebase する
#   途中でコンフリクトする版も作り、--continue と --abort を確かめる
git -C <tgit側> reflog | head      # reflog が記録されていること
```

- 大きなリポジトリでの `log` の実行時間を控えておく（合否には使わないが、極端に遅い場合はメモする）
- リリースの確認：`v0.3.0` タグがあること。1-3 は `DIFFTEST_RUNS=5000` で行う

---

## 3. 検証記録

ステップごとに1行追加する。リポジトリの外に置く。

| 日付 | ステップ | 検証したコミット | 1-3の種と回数 | 結果 | 差し戻した内容・気づいた点 |
|---|---|---|---|---|---|
| | | | | | |
