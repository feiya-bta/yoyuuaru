/* ============================================================================
   i18n.js — 表示言語の切り替え（日本語 / 中文 / English）
   ----------------------------------------------------------------------------
   このアプリはもともと日本語の文言を直接 DOM に書いています。そこで、
   日本語をキーにした辞書で「表示されている文字」をまるごと差し替える方式に
   しています。画面の再描画があっても MutationObserver が新しい文字を拾うので、
   既存のコードに手を入れずに言語を切り替えられます。
   ========================================================================== */
(function () {
    "use strict";

    var LANG_KEY = "yoyu_aru_lang";
    var LANGS = [
        { id: "ja", label: "日本語", sub: "Japanese" },
        { id: "zh", label: "中文", sub: "简体中文" },
        { id: "en", label: "English", sub: "English" }
    ];

    /* [日本語, 中文, English] */
    var ENTRIES = [
        ["余裕、ある？", "有余裕吗？", "Room to Spare?"],
        ["マイルーム", "我的房间", "My Room"],
        ["編集", "编辑", "Edit"],
        ["下に引いて画面を小さくする", "下拉缩小画面", "Pull down to shrink"],
        ["下に引いて小さくする", "下拉缩小", "Pull down to shrink"],
        ["はじめまして", "初次见面", "Nice to meet you"],
        ["（毎回の登録で1ポイントたまります）", "（每次记账获得 1 点）", "(+1 point each time you log)"],
        ["保存する", "保存", "Save"],
        ["あとで", "稍后", "Later"],
        ["今月へ", "回到本月", "This month"],
        ["過去の月を表示中です", "正在显示过去的月份", "Viewing a past month"],
        ["今月の余裕", "本月结余", "This month's room"],
        ["予算が未設定です", "尚未设置预算", "No budget yet"],
        ["円", "日元", "JPY"],
        ["保存", "保存", "Save"],
        ["内訳", "明细", "Breakdown"],
        ["カテゴリ予算", "分类预算", "Category budgets"],
        ["グラフ", "图表", "Charts"],
        ["日別の支出", "每日支出", "Daily spending"],
        ["週別", "按周", "Weekly"],
        ["前月との比較", "与上月比较", "vs. last month"],
        ["支出の記録", "支出记录", "Expense log"],
        ["絞り込み", "筛选", "Filter"],
        ["新しい順", "最新优先", "Newest first"],
        ["古い順", "最早优先", "Oldest first"],
        ["金額が大きい順", "金额从高到低", "Highest amount"],
        ["金額が小さい順", "金额从低到高", "Lowest amount"],
        ["条件をクリア", "清除条件", "Clear filters"],
        ["メニュー", "菜单", "Menu"],
        ["閉じる", "关闭", "Close"],
        ["テーマ（見た目）", "主题（外观）", "Theme"],
        ["ガチャ", "扭蛋", "Gacha"],
        ["ショップ", "商店", "Shop"],
        ["データ管理", "数据管理", "Data"],
        ["カテゴリ設定", "分类设置", "Categories"],
        ["選ぶとすぐに切り替わります。いつでも変えられて、記録したデータには影響しません。", "选择后立即切换。随时可以更改，不会影响已记录的数据。", "Changes apply instantly. You can switch anytime; your data is unaffected."],
        ["支出を記録", "记录支出", "Add expense"],
        ["レシート・画像から読み取る", "从收据/图片读取", "Scan a receipt"],
        ["金額 (円)", "金额（日元）", "Amount (JPY)"],
        ["金額", "金额", "Amount"],
        ["表示通貨は記号のみ変更します。両替・換算はしません。", "仅切换显示货币符号，不进行兑换或换算。", "Only the display currency symbol changes. No conversion is performed."],
        ["カテゴリ", "分类", "Category"],
        ["店舗（任意）", "店铺（可选）", "Store (optional)"],
        ["メモ（任意）", "备注（可选）", "Note (optional)"],
        ["品目（明細・任意）", "品目（明细，可选）", "Items (optional)"],
        ["品目を追加", "添加品目", "Add item"],
        ["合計を金額に入れる", "将合计填入金额", "Use item total"],
        ["日時", "日期时间", "Date & time"],
        ["あとから日付を直せます（レシートの日付に合わせられます）", "之后可以修改日期（可对齐收据上的日期）", "You can adjust the date later to match the receipt."],
        ["記録する", "记录", "Save expense"],
        ["貯金プランナー", "存钱计划", "Savings planner"],
        ["月収とほしいものの金額を入れると、あと何日で買えるかを計算します。支出は実際の記録から自動で見積もります。", "输入月收入和想要的东西的价格，就能算出还要多少天才能买到。支出会根据实际记录自动估算。", "Enter your income and goal amount to see how many days until you can buy it. Spending is estimated from your records."],
        ["月収（手取り）", "月收入（税后）", "Monthly income (net)"],
        ["ほしいものの金額", "想要的东西的价格", "Goal amount"],
        ["月の支出", "每月支出", "Monthly spending"],
        ["難易度を選ぶ", "选择难度", "Difficulty"],
        ["かんたん", "简单", "Easy"],
        ["ゆるく節約して貯める", "轻松节省慢慢存", "Save gently"],
        ["ふつう", "普通", "Normal"],
        ["バランスよく節約する", "均衡节省", "Balanced saving"],
        ["むずかしい", "困难", "Hard"],
        ["しっかり節約して貯める", "严格节省努力存", "Save aggressively"],
        ["シミュレーションする", "开始模拟", "Simulate"],
        ["シミュレーション結果", "模拟结果", "Simulation result"],
        ["で達成できます！", "就能达成！", "you can reach it!"],
        ["毎月の貯金額", "每月储蓄额", "Monthly savings"],
        ["自由に使えるお金", "可自由使用的钱", "Spendable money"],
        ["達成予定日", "预计达成日", "Target date"],
        ["アドバイス", "建议", "Advice"],
        ["貯金プラン", "存钱计划", "Savings plan"],
        ["解除", "解除", "Clear"],
        ["収入の 100% を貯金に回す計算です。かなり厳しいので、期間を長めに考えましょう。", "这是把收入的 100% 都存起来的计算。相当严格，建议把周期放长一些。", "This plan saves 100% of your income. It's very strict, so consider a longer period."],
        ["購入", "购买", "Buy"],
        ["ガチャッ…", "扭蛋…", "Gacha..."],
        ["ノーマル／あたらしいペット", "普通／新宠物", "Normal / New pet"],
        ["新しいカテゴリを追加", "添加新分类", "Add a category"],
        ["カテゴリ名", "分类名称", "Category name"],
        ["キャンセル", "取消", "Cancel"],
        ["追加する", "添加", "Add"],
        ["カテゴリ別予算", "分类预算", "Category budgets"],
        ["今月、カテゴリごとに使える金額を決めます。空欄のカテゴリは「決めない」になります。", "设置本月每个分类可用的金额。留空的分类表示「不设置」。", "Set how much you can spend per category this month. Blank means no limit."],
        ["過去3か月から提案", "根据过去 3 个月推荐", "Suggest from 3 months"],
        ["カテゴリ予算の合計が総予算を超えても保存できます。超えている場合は赤く表示します。", "分类预算合计超过总预算也可以保存，超过时会以红色显示。", "You can save even if category budgets exceed the total. Overspending is shown in red."],
        ["この内容で保存", "保存此内容", "Save these"],
        ["設定", "设置", "Settings"],
        ["効果音", "音效", "Sound"],
        ["振動（対応する端末のみ）", "振动（仅支持设备）", "Vibration (supported devices)"],
        ["使い方をもう一度見る", "再看一次使用方法", "View the guide again"],
        ["バックアップ（CSV）", "备份（CSV）", "Backup (CSV)"],
        ["支出・予算・カテゴリ・貯金プラン・マイルーム（ポイント、ペット、家具、ガチャ）まで、すべてを1つのCSVにまとめて書き出します。読み込みでは、このCSVのほか、銀行・カード明細のCSVも自動で判別します。（レシートの写真とAPIキーは含まれません）", "把支出、预算、分类、存钱计划、我的房间（点数、宠物、家具、扭蛋）全部汇总到一个 CSV 导出。导入时除了这个 CSV，还会自动识别银行和信用卡账单的 CSV。（不包含收据照片和 API 密钥）", "Export expenses, budgets, categories, savings plans and My Room (points, pets, furniture, gacha) into one CSV. On import it also recognises bank and card statements. Receipt photos and API keys are not included."],
        ["CSVを書き出す", "导出 CSV", "Export CSV"],
        ["CSVを読み込む", "导入 CSV", "Import CSV"],
        ["AI設定（レシート読み取り・ペットとの会話）", "AI 设置（收据读取・宠物对话）", "AI settings (receipts & pet chat)"],
        ["レシートの自動入力は、APIキーなしでも1日に5回まで使えます（サーバー経由。画像は読み取りのためだけにサーバーと Google へ送られ、保存されません）。ペットとのAI会話も、APIキーなしで1日10回まで使えます。自分の APIキー を入れると、回数の制限なしで使えます。キーはこの端末にだけ保存され、このアプリのコードやGitHubには含まれません。使うときだけ、レシート画像や話しかけた内容がサーバーと Google へ送信されます。", "没有 API 密钥时，收据自动识别每天可使用 5 次（经由服务器。图片只为识别而发送给服务器和 Google，不会被保存）。宠物 AI 对话每天也可免费使用 10 次。填入自己的 API 密钥后可不限次数使用。密钥只保存在本机，不包含在本应用代码或 GitHub 中。只有使用时，收据图片或对话内容才会发送给服务器和 Google。", "Receipt scanning works up to 5 times a day without an API key (via our server; images are sent only for reading and are not stored). AI pet chat also works up to 10 messages a day without a key. Add your own key for unlimited use. The key stays on this device and is never included in the app code or GitHub. Images and messages are sent to our server and Google only when you use the feature."],
        ["サービス", "服务", "Provider"],
        ["その他（OpenAI 互換のエンドポイント）", "其他（OpenAI 兼容端点）", "Other (OpenAI-compatible)"],
        ["APIキー", "API 密钥", "API key"],
        ["モデル名", "模型名称", "Model"],
        ["エンドポイント", "端点", "Endpoint"],
        ["接続テスト", "连接测试", "Test connection"],
        ["リセット", "重置", "Reset"],
        ["今月分の支出と予算だけを消すか、すべてのデータを消して初期状態に戻せます。元に戻せないのでご注意ください。", "可以只清空本月的支出和预算，也可以清除全部数据恢复初始状态。此操作无法撤销，请注意。", "Clear only this month's expenses and budget, or erase everything and start over. This cannot be undone."],
        ["今月のデータをリセット", "重置本月数据", "Reset this month"],
        ["全データをリセット", "重置全部数据", "Reset everything"],
        ["お迎えするペットを選んでね", "选择要迎接的宠物吧", "Choose your new pet"],
        ["一緒に貯金をがんばる相棒を選ぼう。", "选一个一起努力存钱的伙伴吧。", "Pick a buddy to save money with."],
        ["ねこ", "猫", "Cat"],
        ["うさぎ", "兔子", "Rabbit"],
        ["しばいぬ", "柴犬", "Shiba"],
        ["ハムスター", "仓鼠", "Hamster"],
        ["パンダ", "熊猫", "Panda"],
        ["ペットを選ぶと名前をつけられるよ", "选好宠物后就可以给它起名字了", "You can name your pet after choosing"],
        ["ねこに名前をつけよう", "给猫起个名字吧", "Name your cat"],
        ["うさぎに名前をつけよう", "给兔子起个名字吧", "Name your rabbit"],
        ["これから毎日、家計管理を応援してくれるよ。", "今后每天都会为你管理家计加油。", "It will cheer you on with your budget every day."],
        ["名前", "名字", "Name"],
        ["この名前にする", "使用这个名字", "Use this name"],
        ["ログインボーナス！", "登录奖励！", "Login bonus!"],
        ["今日も余裕、ある？", "今天也有余裕吗？", "Room to spare today?"],
        ["ログインポイントを受け取ろう", "领取登录点数吧", "Claim your login points"],
        ["受け取る", "领取", "Claim"],
        ["pt 所持", "持有 pt", "pt owned"],
        ["ひく", "抽取", "Draw"],
        ["コレクション", "收藏", "Collection"],
        ["ログインや記録でためたポイントで、あたらしい仲間やお部屋が手に入ります。", "用登录和记账积攒的点数，可以获得新的伙伴和房间。", "Use points from logins and records to unlock new friends and rooms."],
        ["ガチャをひく", "抽取扭蛋", "Draw gacha"],
        ["まだ持っていないものだけが出ます（ダブりなし）。1回", "只会出现还没有的东西（不重复）。每次", "Only new items appear (no duplicates). Each draw"],
        ["pt です。", "pt。", "pt."],
        ["持っているものをタップすると切りかえられます。", "点击已拥有的物品即可切换。", "Tap an owned item to equip it."],
        ["ペット", "宠物", "Pets"],
        ["部屋（マップ）", "房间（地图）", "Rooms"],
        ["すべてのアイテムを購入しました！", "已购买所有物品！", "You own every item!"],
        ["マイルーム編集", "编辑我的房间", "Edit My Room"],
        ["横にスワイプして部屋全体を確認。ドラッグで移動。", "横向滑动查看整个房间，拖动可移动。", "Swipe sideways to see the room. Drag to move items."],
        ["持ち物", "持有物品", "Inventory"],
        ["所持ポイント", "持有积分", "Points"],
        ["部屋を編集", "编辑房间", "Edit room"],
        ["画面を小さくする", "缩小画面", "Shrink"],
        ["記録するほどペットとなかよくなります", "记账越多，和宠物越亲近", "Log more to grow closer to your pet"],
        ["ペットに話しかける", "和宠物说话", "Talk to your pet"],
        ["送信", "发送", "Send"],
        ["前の月", "上个月", "Previous month"],
        ["次の月", "下个月", "Next month"],
        ["予算を編集", "编辑预算", "Edit budget"],
        ["キーワード（メモ・店舗・品目）", "关键词（备注・店铺・品目）", "Keyword (note, store, item)"],
        ["金額 下限", "金额下限", "Min amount"],
        ["金額 上限", "金额上限", "Max amount"],
        ["読み取りしたレシート", "扫描的收据", "Scanned receipt"],
        ["例：スーパーA", "例：超市 A", "e.g. Supermarket A"],
        ["例：週末のまとめ買い", "例：周末采购", "e.g. Weekend groceries"],
        ["例：交際費", "例：社交费", "e.g. Social"],
        ["ここに貼り付け", "粘贴到这里", "Paste here"],
        ["例：もち", "例：麻糬", "e.g. Mochi"],
        ["食費", "餐饮", "Food"],
        ["日用品", "日用品", "Daily goods"],
        ["交通費", "交通", "Transport"],
        ["娯楽", "娱乐", "Fun"],
        ["医療", "医疗", "Medical"],
        ["その他", "其他", "Other"],
        ["すべてのカテゴリ", "所有分类", "All categories"],
        ["今月", "本月", "This month"],
        ["予算なし", "无预算", "No budget"],
        ["未設定", "未设置", "Not set"],
        ["不明", "不明", "Unknown"],
        ["削除", "删除", "Delete"],
        ["更新する", "更新", "Update"],
        ["条件に合う支出がありません", "没有符合条件的支出", "No matching expenses"],
        ["今月の支出はまだありません", "本月还没有支出", "No expenses this month yet"],
        ["今月の支出はまだ記録されていません", "本月还没有支出记录", "No expenses recorded this month"],
        ["この月の支出はまだありません", "这个月还没有支出", "No expenses this month"],
        ["週別のデータがありません", "没有按周的数据", "No weekly data"],
        ["前月と比べられるデータがありません", "没有可以和上月比较的数据", "No data to compare with last month"],
        ["この月のデータがありません", "这个月没有数据", "No data for this month"],
        ["支出を編集", "编辑支出", "Edit expense"],
        ["元に戻す", "撤销", "Undo"],
        ["支出を削除しました", "已删除支出", "Expense deleted"],
        ["記録できた！", "记账成功！", "Logged!"],
        ["更新した！", "已更新！", "Updated!"],
        ["記録できた！100ptゲット。えらい", "记账成功！获得 100pt，真棒", "Logged! +100 pt. Nice!"],
        ["来月以降の日付は記録できません。日時を確認してください。", "不能记录下个月及以后的日期，请检查日期时间。", "You can't record a future month. Please check the date."],
        ["入力中の内容は保存されません。閉じますか？", "正在输入的内容不会被保存。要关闭吗？", "Your changes won't be saved. Close anyway?"],
        ["1円以上の予算を設定してね！", "请设置 1 日元以上的预算！", "Please set a budget of at least ¥1."],
        ["先に今月の予算を設定してね！", "请先设置本月预算！", "Set this month's budget first!"],
        ["カテゴリ名を入力してください。", "请输入分类名称。", "Enter a category name."],
        ["同じ名前のカテゴリが既にあります。", "已经有同名分类了。", "A category with that name already exists."],
        ["カテゴリは最低1つ必要です。", "至少需要一个分类。", "You need at least one category."],
        ["ポイントが足りません", "点数不足", "Not enough points"],
        ["すべて集めました！", "全部集齐了！", "You collected everything!"],
        ["コンプリート！ すべてのペットと部屋を集めました。", "完成！集齐了所有宠物和房间。", "Complete! You collected every pet and room."],
        ["設定を保存しました", "设置已保存", "Settings saved"],
        ["保存できませんでした", "保存失败", "Couldn't save"],
        ["設定済み：レシートから読み取れます", "已设置：可以从收据读取", "Configured: receipt scanning is available"],
        ["未設定：手入力のみ使えます", "未设置：只能手动输入", "Not configured: manual entry only"],
        ["おまかせ読み取り：サーバー経由で使えます", "自助读取：可通过服务器使用", "Auto scan: available via server"],
        ["APIキーを入力するか、おまかせ読み取りのサーバーを設定してください。", "请输入 API 密钥，或设置自助读取服务器。", "Enter an API key, or configure the auto-scan server."],
        ["おまかせ読み取りに接続できました。", "已连接到自助读取服务。", "Connected to the auto-scan service."],
        ["サーバーが未設定です", "服务器尚未设置", "Server is not configured"],
        ["接続がタイムアウトしました", "连接超时", "Connection timed out"],
        ["サーバーに接続できません", "无法连接服务器", "Can't connect to the server"],
        ["接続を確認しています…", "正在检查连接…", "Checking connection…"],
        ["接続できました！レシートを読み取れます。", "连接成功！可以读取收据了。", "Connected! Receipt scanning is ready."],
        ["APIキーを入力してください。", "请输入 API 密钥。", "Enter an API key."],
        ["読み取り結果を反映しました。内容を確認してください。", "已填入读取结果，请确认内容。", "Scan results applied. Please review them."],
        ["先に「データ管理」でAPIキーを設定してください。手入力はそのまま使えます。", "请先在「数据管理」中设置 API 密钥。手动输入仍然可用。", "Set an API key in Data first. Manual entry still works."],
        ["画像を準備しています…", "正在准备图片…", "Preparing image…"],
        ["レシートを読み取っています…", "正在读取收据…", "Reading receipt…"],
        ["今日は読み取りの利用が多く、いったん受付を終了しました。明日また試すか、手入力してください。", "今天的读取次数较多，暂时停止受理。请明天再试或手动输入。", "Today's scan limit is reached. Try again tomorrow or enter it manually."],
        ["今日の読み取り回数の上限に達しました。明日また使えます。", "已达到今天的读取次数上限。明天可以继续使用。", "You've reached today's scan limit. Try again tomorrow."],
        ["読み取りがタイムアウトしました。通信環境を確認して、もう一度試してください。", "读取超时。请检查网络后重试。", "Scan timed out. Check your connection and try again."],
        ["通信できませんでした。オフラインか、接続が制限されている可能性があります。", "无法通信。可能处于离线状态或连接受限。", "Couldn't connect. You may be offline or the connection is restricted."],
        ["読み取りサービスに接続できませんでした。時間をおいて試してください。", "无法连接读取服务。请稍后再试。", "Couldn't reach the scan service. Try again later."],
        ["品目の合計とレシートの合計が一致しました", "品目合计与收据合计一致", "Item total matches the receipt total"],
        ["黄色で示した行の金額を確認してください。", "请确认黄色标注行的金额。", "Check the amounts in the highlighted rows."],
        ["明細と合計が一致しないことを確認しました", "我已确认明细与合计不一致", "I've reviewed the mismatch between items and total"],
        ["今日はたくさん話したから、また明日ね。", "今天聊得够多啦，明天再聊吧。", "We've talked a lot today—let's chat again tomorrow."],
        ["明細と合計が一致していません。確認チェックを入れてから保存してください。", "明细与合计不一致。请勾选确认后再保存。", "Items and total don't match. Check the confirmation box before saving."],
        ["最後のバックアップから", "距离上次备份已经", "It has been"],
        ["日たちました。CSVを書き出しておくと安心です。", "天了。导出 CSV 备份会更安心。", "days since your last backup. Export a CSV to stay safe."],
        ["まだバックアップがありません。CSVを書き出しておくと、端末が壊れても安心です。", "还没有备份。导出 CSV 后，即使设备损坏也安心。", "No backup yet. Export a CSV so your data survives a broken device."],
        ["目標達成！おめでとう！", "目标达成！恭喜！", "Goal reached! Congratulations!"],
        ["今月の予算を決めよう", "来设置本月预算吧", "Set this month's budget"],
        ["予算を決めると、余裕を教えてあげられるよ", "设置预算后，我就能告诉你还剩多少余裕啦", "Set a budget and I can tell you how much room you have"],
        ["上の えんぴつ から予算を入れてね", "点上面的铅笔图标输入预算吧", "Tap the pencil above to enter a budget"],
        ["まず今月の予算を決めてみよう", "先来设置本月预算吧", "Start by setting this month's budget"],
        ["ベストフレンド", "挚友", "Best friend"],
        ["なかよし", "亲密", "Close"],
        ["ともだち", "朋友", "Friend"],
        ["なれてきた", "渐渐熟悉", "Getting close"],
        ["かおなじみ", "熟面孔", "Familiar"],
        ["おはよう！今日もゆとり、ある？", "早上好！今天也有余裕吗？", "Good morning! Room to spare today?"],
        ["こんにちは！記録、進んでる？", "你好！记账顺利吗？", "Hi! How's the logging going?"],
        ["こんばんは！おつかれさま", "晚上好！辛苦啦", "Good evening! You worked hard."],
        ["こんにちは！今日も一緒にがんばろう", "你好！今天也一起加油吧", "Hi! Let's do our best today too."],
        ["遅い時間だね。もう寝よう？", "已经很晚了，该睡了吧？", "It's late. Time for bed?"],
        ["なにか話したいのかな？", "想聊点什么吗？", "Something on your mind?"],
        ["ありがとう！うれしい", "谢谢！好开心", "Thanks! That makes me happy."],
        ["元気だよ！あなたも無理しないでね", "我很好！你也不要太勉强哦", "I'm good! Don't push yourself too hard."],
        ["おやすみ。また明日ね", "晚安，明天见", "Good night. See you tomorrow."],
        ["なるほど！", "原来如此！", "I see!"],
        ["そうなんだ！", "是这样啊！", "Really!"],
        ["うん、聞いてるよ！", "嗯，我在听哦！", "Yeah, I'm listening!"],
        ["ふむふむ…", "嗯嗯…", "Mm-hmm…"],
        ["うとうと…", "迷迷糊糊…", "Dozing off…"],
        ["ぺろぺろ…", "舔舔…", "Lick lick…"],
        ["もぐもぐ", "嚼嚼", "Munch munch"],
        ["えいっ！", "嘿！", "Hup!"],
        ["ん…むにゃ", "嗯…唔喵", "Mm… mumble"],
        ["ふぁ…おきた", "哈…醒了", "Yawn… I'm up"],
        ["ん…なあに？", "嗯…怎么了？", "Mm… what is it?"],
        ["今日も一緒にがんばろう", "今天也一起加油吧", "Let's do our best today"],
        ["おかえり！今日もおつかれさま", "欢迎回来！今天也辛苦啦", "Welcome back! Good work today"],
        ["記録できてえらい", "记账了，真棒", "You logged it. Nice!"],
        ["小さな節約も未来の余裕につながる", "小小的节省也会带来未来的余裕", "Small savings add up to future breathing room"],
        ["まだ予算に余裕がある", "预算还有余裕", "You still have room in your budget"],
        ["この調子、いい感じ", "这个节奏很不错", "You're doing great"],
        ["目標に向かってコツコツいこう", "朝着目标一步步努力吧", "Keep moving toward your goal"],
        ["無理しない節約がいちばん", "不勉强的节省才最长久", "Sustainable saving is best"],
        ["そろそろ予算が心配", "开始有点担心预算了", "Your budget is getting tight"],
        ["使いすぎに気をつけよう", "注意不要花太多", "Watch out for overspending"],
        ["ちょっとだけブレーキかけよう", "稍微踩一下刹车吧", "Ease off the spending a little"],
        ["目標を思い出して、今日はゆっくり考えてから買おう", "想想目标，今天买东西前慢慢考虑一下", "Remember your goal and think before buying today"],
        ["予算オーバーだ", "超出预算了", "You're over budget"],
        ["大丈夫、ここから立て直せばいい", "没关系，从这里重新调整就好", "It's okay. You can turn it around from here"],
        ["標準", "标准", "Standard"],
        ["いつもの、やわらかい紙の色", "一如既往的柔和纸张色", "The usual soft paper tone"],
        ["手帳", "手账", "Notebook"],
        ["点々の紙に、判子のような枠とテープ", "点点纸配上印章般的边框和胶带", "Dotted paper with stamp-like frames and tape"],
        ["ドット", "像素", "Pixel"],
        ["ゲーム画面のような、くっきりした見た目", "像游戏画面一样清晰的视觉", "Crisp, game-screen look"],
        ["夜", "夜间", "Night"],
        ["暗い場所でも目にやさしい", "在暗处也护眼", "Easy on the eyes in the dark"],
        ["おまかせ", "自动", "Auto"],
        ["端末の設定（ライト／ダーク）に合わせる", "跟随设备设置（浅色/深色）", "Follow your device's light/dark mode"],
        ["ノーマル", "普通", "Normal"],
        ["レア", "稀有", "Rare"],
        ["スーパーレア", "超稀有", "Super rare"],
        ["部屋", "房间", "Room"],
        ["はじまりの部屋", "初始房间", "Starter room"],
        ["さくらの和室", "樱花和室", "Sakura room"],
        ["うみべの部屋", "海边房间", "Seaside room"],
        ["ほしぞらロフト", "星空阁楼", "Starry loft"],
        ["つかっている", "使用中", "In use"],
        ["ガチャで手に入るよ", "可以通过扭蛋获得", "Available from gacha"],
        ["名前をつけよう", "起个名字吧", "Give it a name"],
        ["この子といっしょにくらす", "和这个孩子一起生活", "Live with this one"],
        ["この部屋にお引っこし", "搬进这个房间", "Move into this room"],
        ["あとで（コレクションに入れる）", "稍后（放入收藏）", "Later (add to collection)"],
        ["使い方ガイド", "使用指南", "How to use"],
        ["データ管理を開く", "打开数据管理", "Open Data"],
        ["はじめる", "开始", "Start"],
        ["次へ", "下一步", "Next"],
        ["スキップ", "跳过", "Skip"],
        ["予算を入れる", "输入预算", "Set budget"],
        ["① 今月の予算を決めよう", "① 先设置本月预算", "1. Set this month's budget"],
        ["② 1件、記録してみよう", "② 记录一笔试试", "2. Log one expense"],
        ["③ ペットと遊ぼう", "③ 和宠物玩耍", "3. Play with your pet"],
        ["④ 最後に、だいじなこと", "④ 最后，重要的事", "4. One important thing"],
        ["言語", "语言", "Language"],
        ["表示言語", "显示语言", "Display language"],
        ["言語を選ぶ", "选择语言", "Choose a language"],
        ["言語を変えると、画面の文字がすぐに切り替わります。", "更改语言后，画面文字会立即切换。", "The interface switches instantly when you change the language."],
        ["季節の背景", "季节背景", "Seasonal background"],
        ["季節に合わせて部屋の背景が変わります", "房间背景会根据季节变化", "Your room changes with the seasons"],
        ["地域", "地区", "Region"],
        ["日本", "日本", "Japan"],
        ["韓国", "韩国", "Korea"],
        ["中国", "中国", "China"],
        ["春天", "春天", "Spring"],
        ["夏天", "夏天", "Summer"],
        ["秋天", "秋天", "Autumn"],
        ["冬天", "冬天", "Winter"],
        ["アメリカ", "美国", "United States"],
        ["ヨーロッパ", "欧洲", "Europe"],
        ["オーストラリア（南半球）", "澳大利亚（南半球）", "Australia (Southern Hemisphere)"],
        ["自動で切り替える", "自动切换", "Switch automatically"],
        ["今の背景", "当前背景", "Current background"],
        ["季節の背景は画面全体に表示されます。選んだ部屋はそのまま残ります。", "季节背景会显示在整个画面上。已选择的房间不会改变。", "The seasonal background covers the whole screen; your chosen room stays the same."],
        ["背景は部屋の壁紙の上に重なります。選んだ部屋はそのまま残ります。", "背景会叠加在房间壁纸上，已选择的房间不会改变。", "The seasonal scene layers over your room wallpaper; your chosen room stays the same."],
        ["この地域の季節と行事に合わせて、背景を自動で選びます。", "会根据该地区的季节和节日自动选择背景。", "The background follows this region's seasons and holidays."],
        ["変更はすぐに反映されます。", "更改会立即生效。", "Changes apply right away."],
        ["自動で切り替えるをオフにすると、季節の背景は表示されません。", "关闭自动切换后，将不再显示季节背景。", "Turn off auto switching to hide the seasonal background."],
        ["背景なし", "无背景", "No background"],
        ["オフ", "关闭", "Off"],
        ["春", "春天", "Spring"],
        ["夏", "夏天", "Summer"],
        ["秋", "秋天", "Autumn"],
        ["冬", "冬天", "Winter"],
        ["お正月", "新年", "New Year"],
        ["春節", "春节", "Lunar New Year"],
        ["バレンタイン", "情人节", "Valentine's Day"],
        ["イースター", "复活节", "Easter"],
        ["桜", "樱花", "Sakura"],
        ["ゴールデンウィーク", "黄金周", "Golden Week"],
        ["梅雨", "梅雨", "Rainy season"],
        ["七夕", "七夕", "Tanabata"],
        ["花火", "烟花", "Fireworks"],
        ["ハロウィン", "万圣节", "Halloween"],
        ["感謝祭", "感恩节", "Thanksgiving"],
        ["クリスマス", "圣诞节", "Christmas"],
        ["南半球のクリスマス", "南半球的圣诞", "Southern summer Christmas"],
        ["中秋節", "中秋节", "Mid-Autumn"],
        ["建国記念日", "建国纪念日", "National Day"],
        ["独立記念日", "独立日", "Independence Day"],
        ["オーストラリア・デー", "澳大利亚日", "Australia Day"],
        ["元日", "元旦", "New Year's Day"],
        ["大晦日", "除夕", "New Year's Eve"],
        ["節分", "节分", "Setsubun"],
        ["ひな祭り", "女儿节", "Hinamatsuri"],
        ["こどもの日", "儿童节", "Children's Day"],
        ["母の日", "母亲节", "Mother's Day"],
        ["父の日", "父亲节", "Father's Day"],
        ["端午の節句", "端午节", "Dragon Boat Festival"],
        ["元宵節", "元宵节", "Lantern Festival"],
        ["清明節", "清明节", "Qingming"],
        ["重陽節", "重阳节", "Double Ninth"],
        ["冬至", "冬至", "Winter solstice"],
        ["夏至", "夏至", "Summer solstice"],
        ["ペットと一緒に続ける家計簿アプリ", "和宠物一起坚持记账的家计应用", "A budget app you keep up with your pet"],
        ["うまく動かない操作がありました。続くときは再読み込みしてください", "有操作未能正常完成。如要继续，请重新加载页面。", "Something didn't work. Reload the page if you want to continue."],
        ["予算を決めよう", "来定预算吧", "Set a budget"],
        ["過去3か月の平均から提案しました。金額は自由に直せます", "已根据过去 3 个月的平均值推荐，金额可以自由修改。", "Suggested from your 3-month average. Feel free to adjust it."],
        ["提案できるだけの記録がまだありません", "还没有足够的记录可以用来推荐。", "Not enough records to make a suggestion yet."],
        ["カテゴリ予算をクリアしました", "已清除分类预算", "Category budgets cleared"],
        ["（名称なし）", "（无名称）", "(no name)"],
        ["品目（例：牛乳）", "品目（例：牛奶）", "Item (e.g. Milk)"],
        ["この行を削除", "删除这一行", "Delete this row"],
        ["読み込みをキャンセルしました。", "已取消导入。", "Import cancelled."],
        ["統合CSVを読み込みましたが、追加されたデータはありません。", "已导入汇总 CSV，但没有新增数据。", "Backup CSV imported, but there was no new data."],
        ["ファイルの読み込みに失敗しました。", "文件读取失败。", "Couldn't read the file."],
        ["読み込めるデータがありませんでした。", "没有可导入的数据。", "There was no data to import."],
        ["初期化が完了しました！（予算は未設定です。自分で決めてください／ポイント: 8,888）", "初始化完成！（预算尚未设置，请自行决定／点数：8,888）", "Reset complete! (No budget is set. Set your own. / Points: 8,888)"],
        ["まだ支出の記録が少ないので、実際の金額を入れてください。", "支出记录还很少，请输入实际金额。", "You don't have many expenses yet. Please enter the actual amount."],
        ["テスト 100円", "测试 100 日元", "Test ¥100"],
        ["ゆとり、ある？", "有余裕吗？", "Got any room?"],
        ["いったん深呼吸して、次の記録から整えていこう", "先深呼吸一下，从下一笔记录开始调整吧", "Take a breath and reset with your next entry"],
        ["いったん深呼吸。次の記録から整えよう", "先深呼吸，从下一笔记录开始调整吧", "Take a breath. Start fresh with the next entry."],
        ["そろそろ予算が心配。今日は我慢できるかな", "开始担心预算了。今天能忍住吗？", "The budget is getting tight. Can you hold back today?"],
        ["半分は使ったね。後半もコツコツ", "已经用了一半，后半段也慢慢来", "Half spent. Keep it steady for the rest."],
        ["余裕たっぷり。いい感じ", "余裕满满，感觉不错", "Plenty of room. Nice."],
        ["ここをタップ／部屋を上にスワイプで元に戻す", "点击这里／向上滑动房间即可恢复", "Tap here or swipe the room up to restore"],
        ["エンドポイントは https:// で指定してください（localhost を除く）。", "端点请使用 https:// 指定（localhost 除外）。", "Use an https:// endpoint (localhost is allowed)."],
        ["今月の予算はまだ決まっていない。", "本月预算还没有决定。", "This month's budget hasn't been set yet."],
        ["例：ぴょん", "例：跳跳", "e.g. Hop"],
        ["1段階前へ", "向前一层", "Move forward one layer"],
        ["1段階後ろへ", "向后一层", "Move back one layer"],
        ["ペットの前後を切り替え", "切换宠物的前后位置", "Toggle pet layering"],
        ["配置を確定", "确定摆放", "Confirm placement"],
        ["持ち物に戻す", "放回持有物品", "Return to inventory"],
        ["日別の支出グラフ", "每日支出图表", "Daily spending chart"],
        ["月収（手取り）を入力してください。", "请输入月收入（税后）。", "Enter your monthly income (net)."],
        ["ほしいものの金額を入力してください。", "请输入想要的东西的价格。", "Enter the goal amount."],
        ["月の支出が収入を上回っています。まず支出を減らす必要があります。", "每月支出超过了收入。需要先减少支出。", "Your spending exceeds your income. You need to cut expenses first."],
        ["まずは「今月の内訳」で一番大きいカテゴリを確認してみましょう。", "先看看「本月明细」中金额最大的分类吧。", "Start by checking the largest category in this month's breakdown."],
        ["1か月以内に手が届きます。もう少しだけ踏ん張ってみましょう。", "一个月内就能实现。再坚持一下吧。", "You're within a month of your goal. Hang in there a little longer."],
        ["1年以上かかる計算です。目標金額を分けて、小さな目標から達成するのもおすすめです。", "计算下来需要一年以上。建议把目标金额拆分，从小目标开始达成。", "This will take over a year. Consider splitting the goal into smaller milestones."],
        ["まだ支出の記録が少ないので、支出額は手入力の値を使っています。記録が増えると精度が上がります。", "支出记录还很少，因此使用手动输入的支出额。记录增加后精度会提高。", "You don't have many expenses yet, so the amount you entered is used. Accuracy improves with more records."],
        ["ファイルがありません。", "没有文件。", "No file."],
        ["画像を読み込めませんでした。", "无法读取图片。", "Couldn't load the image."],
        ["ファイルを読み込めませんでした。", "无法读取文件。", "Couldn't read the file."],
        ["画像のサイズを取得できませんでした。", "无法获取图片尺寸。", "Couldn't read the image size."],
        ["画像を加工できませんでした。", "无法处理图片。", "Couldn't process the image."],
        ["この環境では画像を保存できません。", "当前环境无法保存图片。", "Images can't be saved in this environment."],
        ["画像の保存領域を開けませんでした。", "无法打开图片保存位置。", "Couldn't open the image storage area."],
        ["画像を保存できませんでした。", "无法保存图片。", "Couldn't save the image."],
        ["リクエストが拒否されました。モデル名を確認してください。", "请求被拒绝。请检查模型名称。", "The request was rejected. Check the model name."],
        ["APIキーが正しくないか、権限がありません。", "API 密钥不正确或没有权限。", "The API key is wrong or lacks permission."],
        ["利用回数の上限に達しました。少し待ってから試してください。", "已达到使用次数上限。请稍后再试。", "Usage limit reached. Try again later."],
        ["サーバー側でエラーが発生しました。時間をおいて試してください。", "服务器发生错误。请稍后再试。", "A server error occurred. Try again later."],
        ["APIキーが設定されていません。", "尚未设置 API 密钥。", "No API key is set."],
        ["応答を解釈できませんでした。モデル名やエンドポイントを確認してください。", "无法解析响应。请检查模型名称或端点。", "Couldn't parse the response. Check the model and endpoint."],
        ["レシートを読み取れませんでした。手入力に切り替えてください。", "无法读取收据，请改用手动输入。", "Couldn't read the receipt. Please enter it manually."],
        ["読み取り結果の形式が不正でした。手入力に切り替えてください。", "读取结果格式不正确，请改用手动输入。", "The scan result was malformed. Please enter it manually."],
        ["金額を読み取れませんでした。もう一度撮影するか、手入力してください。", "无法读取金额。请重新拍摄或手动输入。", "Couldn't read the amount. Retake the photo or enter it manually."],
        ["合計金額が読み取れていません。金額を確認してください。", "未能读取合计金额，请确认金额。", "The total wasn't read. Please check the amount."],
        ["品目が読み取れていません。合計金額だけが記録されます。", "未能读取品目，只会记录合计金额。", "No items were read. Only the total will be recorded."],
        ["軽減税率（8%）と10%が混在しています。品目の税率を確認してください。", "8% 和 10% 的税率混在一起，请确认各品目的税率。", "8% and 10% tax rates are mixed. Check each item's rate."],
        ["上の予算ボックスの えんぴつ をタップして、今月使ってよい金額を入れてね。予算の80%をこえると、ゲージが赤くなってペットが心配するよ。", "点击上方预算框里的铅笔图标，输入本月可以花的金额。超过预算 80% 时，进度条会变红，宠物会担心哦。", "Tap the pencil in the budget box above and enter what you can spend this month. Past 80%, the gauge turns red and your pet worries."],
        ["右下の ＋ をタップして、金額とカテゴリを入れて「記録する」を押してね。1件記録するごとに100ポイントと、なかよし度が1たまるよ（なかよし度は1日5まで）。", "点右下角的 ＋，输入金额和分类，再按「记录」。每记录一笔可获得 100 点和 1 点亲密度（亲密度每天最多 5 点）。", "Tap + at the bottom right, enter the amount and category, then tap Save. Each entry earns 100 points and 1 bond point (up to 5 a day)."],
        ["ペットをタップすると、今月の予算の余裕に合わせて話してくれるよ。下の入力欄から話しかけることもできます。たまったポイントは、右上のメニューのショップやガチャで使えます。", "点击宠物，它会根据本月预算的余裕和你说话。也可以从下方输入框和它聊天。积攒的点数可以在右上角菜单的商店和扭蛋中使用。", "Tap your pet and it will talk about how much room is left in this month's budget. You can also chat from the box below. Spend points in the Shop and Gacha from the top-right menu."],
        ["データはこの端末の中だけに保存されます。機種変更や万一に備えて、メニューの「データ管理」から、CSVを書き出して保存しておこう。部屋は下に引くと小さくなるよ。", "数据只保存在本机。为了换机或以防万一，请从菜单的「数据管理」导出 CSV 保存。房间向下拉会缩小。", "Your data stays on this device. To prepare for a new phone or accidents, export a CSV from Data in the menu. Pull the room down to shrink it."],
        ["コンプリート済み", "已集齐", "Complete"],
        ["このCSVにはマイルーム（ポイント・家具・ペット）が含まれています。", "这个 CSV 包含我的房间（点数、家具、宠物）数据。", "This CSV includes My Room data (points, furniture, pets)."],
        ["読み込むと、いまのマイルームはCSVの内容に置き換わります。", "导入后，当前的我的房间会被 CSV 的内容替换。", "Importing will replace your current My Room with the CSV contents."],
        ["（同じ月の予算も上書きされます）", "（同月的预算也会被覆盖）", "(Budgets for the same months will also be overwritten)"],
        ["続けますか？", "要继续吗？", "Continue?"],
        ["すべてのデータ（予算・カテゴリ・支出履歴・マイルーム）を削除して初期状態に戻します。この操作は元に戻せません。よろしいですか？", "将删除所有数据（预算、分类、支出历史、我的房间）并恢复初始状态。此操作无法撤销。确定吗？", "This deletes all data (budgets, categories, expense history, My Room) and resets the app. This cannot be undone. Continue?"],
        ["本当によろしいですか？もう一度確認します。", "真的确定吗？再确认一次。", "Are you really sure? One more confirmation."],
        ["（OCR の API キー、アカウント設定、ログイン状態は残ります）", "（OCR 的 API 密钥、账户设置、登录状态会保留）", "(OCR API keys, account settings and login state are kept)"],
        ["データを保存できませんでした。", "无法保存数据。", "Couldn't save your data."],
        ["ブラウザの保存容量がいっぱいか、プライベートモードの可能性があります。", "可能是浏览器存储空间已满，或处于隐私模式。", "Your browser storage may be full, or you may be in private mode."],
        ["「データ管理」でCSVを書き出しておくと安心です。", "建议在「数据管理」中导出 CSV 备份。", "Export a CSV from Data to keep your records safe."],
        ["にゃ～", "喵～", "Meow~"],
        ["ぴょん", "跳跳", "Boing"],
        ["わん", "汪", "Woof"],
        ["まる", "圆圆", "Maru"],
        ["ちゅー", "吱", "Squeak"],
        ["むぎ", "麦麦", "Mugi"],
        ["もふ", "软软", "Fluff"],
        ["たけ", "竹竹", "Take"]
    ];

    var monthEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var monthEnShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    var MAP = { zh: Object.create(null), en: Object.create(null) };
    ENTRIES.forEach(function (row) {
        var ja = row[0], zh = row[1], en = row[2];
        MAP.zh[normalize(ja)] = zh;
        MAP.en[normalize(ja)] = en;
    });

    var SUFFIX_EN = { "予算": "Budget", "内訳": "Breakdown", "余裕": "Leftover", "グラフ": "Chart", "カテゴリ予算": "Category budget" };
    var SUFFIX_ZH = { "予算": "预算", "内訳": "明细", "余裕": "结余", "グラフ": "图表", "カテゴリ予算": "分类预算" };

    var RULES = {
        zh: [
            [/^(.+)、今日からよろしく(にゃ～|ぴょん|わん|ちゅー|もふ)$/, function (m) { return m[1] + "，今后请多关照！"; }],
            [/^(.+)、今日からよろしく$/, function (m) { return m[1] + "，今后请多关照！"; }],
            [/^(.+?)(にゃ～|ぴょん|わん|ちゅー|もふ)$/, function (m, lang) {
                var base = translateRaw(m[1], lang);
                if (base === m[1]) return m[0];
                var s = { "にゃ～": "喵～", "ぴょん": "蹦～", "わん": "汪", "ちゅー": "吱", "もふ": "软软" };
                return base + (s[m[2]] || "");
            }],
            [/^(.+)だよ、よろしく$/, function (m) { return "我是" + m[1] + "，请多关照"; }],
            [/^(.+)にお引っこし$/, function (m, lang) { return "搬到了" + translateRaw(m[1], lang); }],
            [/^(\d{4})年(\d{1,2})月$/, function (m) { return m[1] + "年" + parseInt(m[2], 10) + "月"; }],
            [/^(\d{4})年(\d{1,2})月(\d{1,2})日$/, function (m) { return m[1] + "年" + parseInt(m[2], 10) + "月" + parseInt(m[3], 10) + "日"; }],
            [/^(.+)の(予算|内訳|余裕|グラフ|カテゴリ予算)$/, function (m, lang) { return translateRaw(m[1], lang) + SUFFIX_ZH[m[2]]; }],
            [/^(.+)の支出はまだ記録されていません$/, function (m, lang) { return translateRaw(m[1], lang) + "还没有支出记录"; }],
            [/^(.+)の支出は記録されていません$/, function (m, lang) { return translateRaw(m[1], lang) + "没有支出记录"; }],
            [/^(.+)の支出はありません$/, function (m, lang) { return translateRaw(m[1], lang) + "没有支出"; }],
            [/^(.+)のカテゴリ予算を保存しました$/, function (m, lang) { return "已保存" + translateRaw(m[1], lang) + "的分类预算"; }],
            [/^(.+)の予算を ([\d,]+)円 にしたよ$/, function (m, lang) { return translateRaw(m[1], lang) + "的预算设为 ¥" + m[2]; }],
            [/^(.+)の予算を ([\d,]+)円 から ([\d,]+)円 に変更しますか？$/, function (m, lang) { return "要把" + translateRaw(m[1], lang) + "的预算从 ¥" + m[2] + " 改为 ¥" + m[3] + " 吗？"; }],
            [/^合計 ([\d,]+) 円 \/ 総予算 ([\d,]+) 円$/, function (m) { return "合计 ¥" + m[1] + " / 总预算 ¥" + m[2]; }],
            [/^合計 ([\d,]+) 円$/, function (m) { return "合计 ¥" + m[1]; }],
            [/^([\d,]+)件 \/ ([\d,]+)円$/, function (m) { return m[1] + " 件 / ¥" + m[2]; }],
            [/^([\d,]+) 円$/, function (m) { return "¥" + m[1]; }],
            [/^([\d,]+)円$/, function (m) { return "¥" + m[1]; }],
            [/^あと ([\d,]+) 円（([\d.]+)%）・予定日 (.+)$/, function (m, lang) { return "还差 ¥" + m[1] + "（" + m[2] + "%）・预计 " + translateRaw(m[3], lang); }],
            [/^あと([\d,]+)円$/, function (m) { return "还差 ¥" + m[1]; }],
            [/^([\d,]+)件$/, function (m) { return m[1] + " 件"; }],
            [/^(\d+)日$/, function (m) { return m[1] + " 天"; }],
            [/^(\d+)か月$/, function (m) { return m[1] + " 个月"; }],
            [/^(\d+)月(\d+)日$/, function (m) { return parseInt(m[1], 10) + "月" + parseInt(m[2], 10) + "日"; }],
            [/^約 ?([\d,]+) 円$/, function (m) { return "约 ¥" + m[1]; }],
            [/^連続ログイン (\d+)日$/, function (m) { return "连续登录 " + m[1] + " 天"; }],
            [/^連続ログイン (\d+)日目$/, function (m) { return "连续登录第 " + m[1] + " 天"; }],
            [/^(.+) · (.+)$/, function (m, lang) { return translateRaw(m[1], lang) + " · " + translateRaw(m[2], lang); }],
            [/^目標金額 ([\d,]+) 円を貯めるには…$/, function (m) { return "要存下 ¥" + m[1] + "…"; }],
            [/^約 ?(\d+)日$/, function (m) { return "约 " + m[1] + " 天"; }],
            [/^このペースだと、約 (\d+)日 で「(.+)」に買えます。$/, function (m, lang) { return "按这个速度，大约 " + m[1] + " 天后可以在「" + translateRaw(m[2], lang) + "」买到。"; }],
            [/^([\d,]+) 円 ／ (.+)$/, function (m, lang) { return "¥" + m[1] + " ／ " + translateRaw(m[2], lang); }],
            [/^(\d{4})年(\d{1,2})月、カテゴリごとに使える金額を決めます。空欄のカテゴリは「決めない」になります。$/, function (m) { return m[1] + "年" + parseInt(m[2], 10) + "月，决定每个分类可用的金额。留空的分类表示「不设定」。"; }],
            [/^今月の支出 ([\d,]+) 円$/, function (m) { return "本月支出 ¥" + m[1]; }],
            [/^まだ出会っていないもの：あと (\d+) \/ (\d+) 種$/, function (m) { return "还没遇见：还剩 " + m[1] + " / " + m[2] + " 种"; }],
            [/^(★+) (スーパーレア|レア|ノーマル)（(\d+)種）$/, function (m) {
                var r = { "スーパーレア": "超稀有", "レア": "稀有", "ノーマル": "普通" }[m[2]] || m[2];
                return m[1] + " " + r + "（" + m[3] + "种）";
            }],
            [/^(ノーマル|レア|スーパーレア)／あたらしい(ペット|部屋)$/, function (m) {
                var r = { "スーパーレア": "超稀有", "レア": "稀有", "ノーマル": "普通" }[m[1]] || m[1];
                return r + "／新" + (m[2] === "部屋" ? "房间" : "宠物");
            }],
            [/^ガチャをひく（([\d,]+)pt）$/, function (m) { return "抽扭蛋（" + m[1] + "pt）"; }],
            [/^記録件数: ([\d,]+)件 ／ 保存容量: 約([\d.]+)KB ／ v(.+)$/, function (m) { return "记录数: " + m[1] + " 条 ／ 保存容量: 约" + m[2] + "KB ／ v" + m[3]; }],
            [/^品目の合計（([\d,]+)円）とレシートの合計（([\d,]+)円）が ([\d,]+)円 違います。読み取り漏れの可能性があります。$/, function (m) { return "品目合计（¥" + m[1] + "）与收据合计（¥" + m[2] + "）相差 ¥" + m[3] + "。可能漏读。"; }]
        ],
        en: [
            [/^(.+)、今日からよろしく(にゃ～|ぴょん|わん|ちゅー|もふ)$/, function (m) { return m[1] + ", nice to meet you!"; }],
            [/^(.+)、今日からよろしく$/, function (m) { return m[1] + ", nice to meet you!"; }],
            [/^(.+?)(にゃ～|ぴょん|わん|ちゅー|もふ)$/, function (m, lang) {
                var base = translateRaw(m[1], lang);
                if (base === m[1]) return m[0];
                var s = { "にゃ～": " meow~", "ぴょん": " boing", "わん": " woof", "ちゅー": " squeak", "もふ": " fluff" };
                return base + (s[m[2]] || "");
            }],
            [/^(.+)だよ、よろしく$/, function (m) { return "I'm " + m[1] + ". Nice to meet you!"; }],
            [/^(.+)にお引っこし$/, function (m, lang) { return "Moved to " + translateRaw(m[1], lang); }],
            [/^(\d{4})年(\d{1,2})月$/, function (m) { return monthEn[parseInt(m[2], 10) - 1] + " " + m[1]; }],
            [/^(\d{4})年(\d{1,2})月(\d{1,2})日$/, function (m) { return monthEnShort[parseInt(m[2], 10) - 1] + " " + parseInt(m[3], 10) + ", " + m[1]; }],
            [/^(.+)の(予算|内訳|余裕|グラフ|カテゴリ予算)$/, function (m, lang) { return translateRaw(m[1], lang) + " " + SUFFIX_EN[m[2]]; }],
            [/^(.+)の支出はまだ記録されていません$/, function (m, lang) { return "No expenses recorded for " + translateRaw(m[1], lang) + " yet"; }],
            [/^(.+)の支出は記録されていません$/, function (m, lang) { return "No expenses recorded for " + translateRaw(m[1], lang); }],
            [/^(.+)の支出はありません$/, function (m, lang) { return "No expenses for " + translateRaw(m[1], lang); }],
            [/^(.+)のカテゴリ予算を保存しました$/, function (m, lang) { return "Saved category budgets for " + translateRaw(m[1], lang); }],
            [/^(.+)の予算を ([\d,]+)円 にしたよ$/, function (m, lang) { return "Budget for " + translateRaw(m[1], lang) + " set to ¥" + m[2]; }],
            [/^(.+)の予算を ([\d,]+)円 から ([\d,]+)円 に変更しますか？$/, function (m, lang) { return "Change the budget for " + translateRaw(m[1], lang) + " from ¥" + m[2] + " to ¥" + m[3] + "?"; }],
            [/^合計 ([\d,]+) 円 \/ 総予算 ([\d,]+) 円$/, function (m) { return "Total ¥" + m[1] + " / Budget ¥" + m[2]; }],
            [/^合計 ([\d,]+) 円$/, function (m) { return "Total ¥" + m[1]; }],
            [/^([\d,]+)件 \/ ([\d,]+)円$/, function (m) { return m[1] + " items / ¥" + m[2]; }],
            [/^([\d,]+) 円$/, function (m) { return "¥" + m[1]; }],
            [/^([\d,]+)円$/, function (m) { return "¥" + m[1]; }],
            [/^あと ([\d,]+) 円（([\d.]+)%）・予定日 (.+)$/, function (m, lang) { return "¥" + m[1] + " to go (" + m[2] + "%) · target " + translateRaw(m[3], lang); }],
            [/^あと([\d,]+)円$/, function (m) { return "¥" + m[1] + " to go"; }],
            [/^([\d,]+)件$/, function (m) { return m[1] + " items"; }],
            [/^(\d+)日$/, function (m) { return m[1] + " days"; }],
            [/^(\d+)か月$/, function (m) { return m[1] + " months"; }],
            [/^(\d+)月(\d+)日$/, function (m) { return monthEnShort[parseInt(m[1], 10) - 1] + " " + parseInt(m[2], 10); }],
            [/^約 ?([\d,]+) 円$/, function (m) { return "about ¥" + m[1]; }],
            [/^連続ログイン (\d+)日$/, function (m) { return m[1] + "-day login streak"; }],
            [/^連続ログイン (\d+)日目$/, function (m) { return "Login streak: day " + m[1]; }],
            [/^(.+) · (.+)$/, function (m, lang) { return translateRaw(m[1], lang) + " · " + translateRaw(m[2], lang); }],
            [/^目標金額 ([\d,]+) 円を貯めるには…$/, function (m) { return "To save ¥" + m[1] + "…"; }],
            [/^約 ?(\d+)日$/, function (m) { return "about " + m[1] + " days"; }],
            [/^このペースだと、約 (\d+)日 で「(.+)」に買えます。$/, function (m, lang) { return "At this pace, you can buy it in about " + m[1] + " days on " + translateRaw(m[2], lang) + "."; }],
            [/^([\d,]+) 円 ／ (.+)$/, function (m, lang) { return "¥" + m[1] + " / " + translateRaw(m[2], lang); }],
            [/^(\d{4})年(\d{1,2})月、カテゴリごとに使える金額を決めます。空欄のカテゴリは「決めない」になります。$/, function (m) { return "In " + monthEn[parseInt(m[2], 10) - 1] + " " + m[1] + ", set the amount available for each category. Blank categories mean “no limit”."; }],
            [/^今月の支出 ([\d,]+) 円$/, function (m) { return "This month's spending: ¥" + m[1]; }],
            [/^まだ出会っていないもの：あと (\d+) \/ (\d+) 種$/, function (m) { return "Not met yet: " + m[1] + " / " + m[2] + " left"; }],
            [/^(★+) (スーパーレア|レア|ノーマル)（(\d+)種）$/, function (m) {
                var r = { "スーパーレア": "Super rare", "レア": "Rare", "ノーマル": "Normal" }[m[2]] || m[2];
                return m[1] + " " + r + " (" + m[3] + ")";
            }],
            [/^(ノーマル|レア|スーパーレア)／あたらしい(ペット|部屋)$/, function (m) {
                var r = { "スーパーレア": "Super rare", "レア": "Rare", "ノーマル": "Normal" }[m[1]] || m[1];
                return r + " / New " + (m[2] === "部屋" ? "room" : "pet");
            }],
            [/^ガチャをひく（([\d,]+)pt）$/, function (m) { return "Draw gacha (" + m[1] + "pt)"; }],
            [/^記録件数: ([\d,]+)件 ／ 保存容量: 約([\d.]+)KB ／ v(.+)$/, function (m) { return "Records: " + m[1] + " / Storage: ~" + m[2] + "KB / v" + m[3]; }],
            [/^品目の合計（([\d,]+)円）とレシートの合計（([\d,]+)円）が ([\d,]+)円 違います。読み取り漏れの可能性があります。$/, function (m) { return "Item total (¥" + m[1] + ") and receipt total (¥" + m[2] + ") differ by ¥" + m[3] + ". Some items may be missing."; }]
        ]
    };

    var textRecords = new WeakMap();
    var attrRecords = new WeakMap();
    var titleSource = document.title || "余裕、ある？";
    var current = "ja";
    var applying = false;

    function normalize(value) {
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    }

    function pushUnique(list, value) {
        if (list.indexOf(value) === -1) list.push(value);
    }

    function debugEnabled() {
        try { return localStorage.getItem("yoyu_debug") === "1"; } catch (e) { return false; }
    }

    function queryLang() {
        if (!debugEnabled()) return null;
        try {
            var q = new URLSearchParams(window.location.search).get("lang");
            if (q && LANGS.some(function (l) { return l.id === q; })) return q;
        } catch (e) { /* ignore */ }
        return null;
    }

    function detectLang() {
        var fromQuery = queryLang();
        if (fromQuery) return fromQuery;
        try {
            var saved = localStorage.getItem(LANG_KEY);
            if (saved && LANGS.some(function (l) { return l.id === saved; })) return saved;
        } catch (e) { /* ignore */ }
        var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
        for (var i = 0; i < list.length; i++) {
            var code = String(list[i] || "").toLowerCase();
            if (code.indexOf("zh") === 0) return "zh";
            if (code.indexOf("en") === 0) return "en";
            if (code.indexOf("ja") === 0) return "ja";
        }
        return "ja";
    }

    function readLang() {
        var fromQuery = queryLang();
        if (fromQuery) return fromQuery;
        try {
            var saved = localStorage.getItem(LANG_KEY);
            if (saved && LANGS.some(function (l) { return l.id === saved; })) return saved;
        } catch (e) { /* ignore */ }
        return detectLang();
    }

    function formatCurrency(value) {
        try {
            return window.YOYU_FORMAT_MONEY_TEXT ? window.YOYU_FORMAT_MONEY_TEXT(value) : value;
        } catch (e) {
            return value;
        }
    }

    function translateRaw(value, lang) {
        lang = lang || current;
        var text = normalize(value);
        if (!text || lang === "ja") {
            if (text) recordMissing(text, lang);
            return text;
        }
        var map = MAP[lang];
        if (map && map[text] !== undefined) return formatCurrency(map[text]);
        var rules = RULES[lang] || [];
        for (var i = 0; i < rules.length; i++) {
            var m = text.match(rules[i][0]);
            if (m) {
                try { return formatCurrency(rules[i][1](m, lang)); } catch (e) { return text; }
            }
        }
        recordMissing(text, lang);
        return formatCurrency(String(value));
    }

    /* ============================================================
       デバッグ用：辞書に無い日本語を集める
       localStorage.yoyu_debug === "1" のときだけ動く。
       I18N.missing() / I18N.printMissing() / I18N.exportMissing()
       ============================================================ */
    var MISSING = Object.create(null);

    function isJapaneseText(text) {
        return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(text || ""));
    }

    function hasTranslation(text, lang) {
        var map = MAP[lang];
        if (map && map[text] !== undefined) return true;
        var rules = RULES[lang] || [];
        for (var i = 0; i < rules.length; i++) {
            if (text.match(rules[i][0])) return true;
        }
        return false;
    }

    function recordMissing(value, lang) {
        if (!debugEnabled()) return;
        var key = normalize(value);
        if (!key || !isJapaneseText(key)) return;
        var rec = MISSING[key];
        if (!rec) {
            rec = MISSING[key] = {
                ja: key,
                count: 0,
                zhMissing: false,
                enMissing: false,
                langs: Object.create(null)
            };
        }
        rec.count++;
        rec.langs[lang] = (rec.langs[lang] || 0) + 1;
        if (!hasTranslation(key, "zh")) rec.zhMissing = true;
        if (!hasTranslation(key, "en")) rec.enMissing = true;
    }

    function missingRows() {
        return Object.keys(MISSING).map(function (key) {
            var rec = MISSING[key];
            return {
                ja: rec.ja,
                count: rec.count,
                zh: rec.zhMissing ? "MISSING" : "ok",
                en: rec.enMissing ? "MISSING" : "ok"
            };
        }).filter(function (row) {
            return row.zh === "MISSING" || row.en === "MISSING";
        });
    }

    function printMissing() {
        var rows = missingRows();
        if (!rows.length) {
            console.log("[i18n] no missing translations");
            return rows;
        }
        if (console.table) console.table(rows);
        else console.log(rows);
        return rows;
    }

    function exportMissing() {
        var rows = missingRows();
        if (!debugEnabled()) return rows;
        try {
            var blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "i18n-missing.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (e) { /* ignore */ }
        return rows;
    }

    /* 画面の文字を言語に合わせる（日本語をキーに、元の文字を WeakMap に保存） */
    function translateTextNode(node) {
        if (!node || node.nodeType !== 3) return;
        var parent = node.parentNode;
        if (!parent || parent.nodeType !== 1) return;
        var tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA") return;
        if (parent.closest && parent.closest("[data-i18n-skip]")) return;

        var value = node.nodeValue;
        var rec = textRecords.get(node);
        var source;
        if (!rec) source = value;
        else if (value === rec.out) source = rec.src;
        else source = value;

        if (current === "ja") {
            recordMissing(source, "ja");
            var jaFormatted = formatCurrency(source);
            if (node.nodeValue !== jaFormatted) node.nodeValue = jaFormatted;
            if (jaFormatted !== source) textRecords.set(node, { src: source, out: jaFormatted });
            else textRecords.delete(node);
            return;
        }

        var norm = normalize(source);
        if (!norm) return;
        var translated = translateRaw(norm);
        var lead = source.match(/^\s*/)[0];
        var trail = source.match(/\s*$/)[0];
        var next = translated !== norm ? lead + translated + trail : value;
        textRecords.set(node, { src: source, out: next });
        if (node.nodeValue !== next) node.nodeValue = next;
    }

    var ATTRS = ["placeholder", "title", "aria-label", "alt", "content"];

    function translateAttribute(el, name) {
        if (!el || el.nodeType !== 1 || ATTRS.indexOf(name) === -1) return;
        if (el.closest && el.closest("[data-i18n-skip]")) return;
        var value = el.getAttribute(name);
        if (value == null) return;
        var store = attrRecords.get(el);
        if (!store) { store = Object.create(null); attrRecords.set(el, store); }
        var rec = store[name];
        var source = (!rec || value === rec.out) ? (rec ? rec.src : value) : value;

        if (current === "ja") {
            recordMissing(source, "ja");
            var attrFormatted = formatCurrency(source);
            if (el.getAttribute(name) !== attrFormatted) el.setAttribute(name, attrFormatted);
            if (attrFormatted !== source) store[name] = { src: source, out: attrFormatted };
            else delete store[name];
            return;
        }
        var translated = translateRaw(source);
        store[name] = { src: source, out: translated };
        if (translated !== normalize(source) && value !== translated) el.setAttribute(name, translated);
    }

    function translateElementTree(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.closest && root.closest("[data-i18n-skip]")) return;
        ATTRS.forEach(function (name) {
            if (root.hasAttribute && root.hasAttribute(name)) translateAttribute(root, name);
        });
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
        var node = walker.currentNode;
        while (node) {
            if (node.nodeType === 3) translateTextNode(node);
            else if (node.nodeType === 1) {
                ATTRS.forEach(function (name) {
                    if (node.hasAttribute(name)) translateAttribute(node, name);
                });
            }
            node = walker.nextNode();
        }
    }

    function translateEverything() {
        if (!document.body) return;
        translateElementTree(document.body);
        document.title = current === "ja" ? titleSource : translateRaw(titleSource);
        var meta = document.querySelector('meta[name="description"]');
        if (meta) translateAttribute(meta, "content");
    }

    function applyLanguage(lang, opts) {
        if (!LANGS.some(function (l) { return l.id === lang; })) lang = "ja";
        current = lang;
        if (!(opts && opts.noSave)) {
            try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
        }
        var htmlLang = lang === "zh" ? "zh-CN" : lang;
        document.documentElement.setAttribute("lang", htmlLang);
        document.documentElement.setAttribute("data-lang", lang);

        applying = true;
        try {
            if (lang === "ja") {
                translateEverything();   // restore originals
                document.title = "余裕、ある？";
            } else {
                translateEverything();
            }
        } finally {
            applying = false;
        }
        renderLanguageList();
        try {
            window.dispatchEvent(new CustomEvent("yoyu:languagechange", { detail: { lang: lang } }));
        } catch (e) { /* ignore */ }
    }

    function renderLanguageList() {
        var box = document.getElementById("language-list");
        if (!box) return;
        var cur = readLang();
        box.innerHTML = "";
        LANGS.forEach(function (lang) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "theme-option language-option";
            b.setAttribute("data-i18n-skip", "1");
            b.setAttribute("aria-pressed", lang.id === cur ? "true" : "false");
            var badge = document.createElement("span");
            badge.className = "language-badge";
            badge.textContent = lang.id === "ja" ? "あ" : (lang.id === "zh" ? "中" : "A");
            var tx = document.createElement("span");
            tx.className = "theme-text";
            var n = document.createElement("span");
            n.className = "theme-name";
            n.textContent = lang.label;
            var d = document.createElement("span");
            d.className = "theme-desc";
            d.textContent = lang.sub;
            tx.appendChild(n); tx.appendChild(d);
            var ck = document.createElement("span");
            ck.className = "theme-check";
            ck.textContent = lang.id === cur ? "✓" : "";
            b.appendChild(badge); b.appendChild(tx); b.appendChild(ck);
            b.addEventListener("click", function () {
                applyLanguage(lang.id);
                try { if (window.vibrate) vibrate(10); } catch (e) { /* ignore */ }
            });
            box.appendChild(b);
        });
    }

    function openLanguageModal() {
        var menu = document.getElementById("modal-menu");
        if (menu) menu.classList.remove("open");
        renderLanguageList();
        var modal = document.getElementById("modal-language");
        if (modal) modal.classList.add("open");
    }

    /* confirm / alert の中の文字も翻訳する */
    function translateDialog(message) {
        if (current === "ja") {
            recordMissing(message, "ja");
            return message;
        }
        return String(message == null ? "" : message).split("\n").map(function (line) {
            return translateRaw(line);
        }).join("\n");
    }

    window.I18N = {
        langs: LANGS,
        get lang() { return current; },
        t: function (ja) {
            if (current === "ja") {
                recordMissing(ja, "ja");
                return ja;
            }
            return translateRaw(ja);
        },
        apply: applyLanguage,
        open: openLanguageModal,
        translate: translateRaw,
        missing: missingRows,
        printMissing: printMissing,
        exportMissing: exportMissing
    };

    try {
        var nativeAlert = window.alert.bind(window);
        var nativeConfirm = window.confirm.bind(window);
        window.alert = function (message) { return nativeAlert(translateDialog(message)); };
        window.confirm = function (message) { return nativeConfirm(translateDialog(message)); };
    } catch (e) { /* ignore */ }

    current = readLang();

    function boot() {
        applyLanguage(current, { noSave: true });
        renderLanguageList();

        var openBtn = document.getElementById("btn-open-language");
        if (openBtn) openBtn.addEventListener("click", openLanguageModal);
        var menuBtn = document.getElementById("btn-open-language-menu");
        if (menuBtn) menuBtn.addEventListener("click", openLanguageModal);
        var closeBtn = document.getElementById("btn-close-language");
        if (closeBtn) closeBtn.addEventListener("click", function () {
            var modal = document.getElementById("modal-language");
            if (modal) modal.classList.remove("open");
        });

        var observer = new MutationObserver(function (mutations) {
            if (applying) return;
            applying = true;
            try {
                mutations.forEach(function (m) {
                    if (m.type === "childList") {
                        m.addedNodes.forEach(function (node) {
                            if (node.nodeType === 1) translateElementTree(node);
                            else if (node.nodeType === 3) translateTextNode(node);
                        });
                    } else if (m.type === "characterData") {
                        translateTextNode(m.target);
                    } else if (m.type === "attributes") {
                        translateAttribute(m.target, m.attributeName);
                    }
                });
            } finally { applying = false; }
        });
        observer.observe(document.body, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ATTRS
        });

        /* アプリ側の初回描画のあとに一度だけ追いかける */
        setTimeout(function () { applyLanguage(current, { noSave: true }); }, 0);
        setTimeout(function () { applyLanguage(current, { noSave: true }); }, 600);
        if (debugEnabled()) {
            setTimeout(function () {
                try { printMissing(); } catch (e) { /* ignore */ }
            }, 2500);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
