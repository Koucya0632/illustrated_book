// Authored local candidates and contextual annotations. No network or production writes.
import fs from 'node:fs';
const series='cherry-blossom-season';
const S=(t,z,j,e,r)=>({t,z,j,e,...(r?{r}:{})});
const rows=[
{
 id:'cherry-blossom',word:'cherry blossom',chinese:'櫻花',ja:'桜',reading:'さくら',ipa:'/ˈtʃer.i ˌblɑː.səm/',
 zhDef:'櫻樹開的花，常見淡粉紅或白色；與作為水果的櫻桃不同。',
 enDef:'A flower of a cherry tree, often pale pink or white.',jaDef:'桜の木に咲く花。白や淡いピンク色などがあり、春の花見で親しまれる。',
 reasons:['桜對應櫻樹花朵；英文 cherry blossom 與既有水果 cherry／さくらんぼ 明確分開。讀音さくら完整。','以拍照呈現實際賞花動作；三語皆是拍攝櫻花，A2 的單一動作清楚。','預報降雨促使今天去看櫻花，ので與 today／tomorrow 的時間與原因三語一致；與拍照句用途不同。'],
 ex:[
 ['I took a photo of the cherry blossoms.','桜の写真を撮りました。','我拍了櫻花的照片。',
 ['I ',S('took','拍了','撮りました','took'),' a ',S('photo','照片','写真','photo'),' of the ',S('cherry blossoms','櫻花','桜','cherry blossoms'),'.'],
 [S('桜','櫻花','桜','cherry blossoms','さくら'),'の',S('写真','照片','写真','photo','しゃしん'),'を',S('撮りました','拍了','撮りました','took','とりました'),'。']],
 ['Rain is forecast for tomorrow, so we went to see the cherry blossoms today.','明日は雨の予報なので、今日、桜を見に行きました。','預報明天會下雨，所以我們今天去看了櫻花。',
 [S('Rain','雨','雨','rain'),' is ',S('forecast','預報','予報されている','forecast'),' for ',S('tomorrow','明天','明日','tomorrow'),', so we ',S('went','去了','行きました','went'),' to ',S('see','看','見る','see'),' the ',S('cherry blossoms','櫻花','桜','cherry blossoms'),' ',S('today','今天','今日','today'),'.'],
 [S('明日','明天','明日','tomorrow','あした'),'は',S('雨','雨','雨','rain','あめ'),'の',S('予報','預報','予報','forecast','よほう'),'なので、',S('今日','今天','今日','today','きょう'),'、',S('桜','櫻花','桜','cherry blossoms','さくら'),'を',S('見','看','見る','see','み'),'に',S('行きました','去了','行きました','went','いきました'),'。']]
 ]
},
{
 id:'flower-bud',word:'flower bud',chinese:'花苞',ja:'つぼみ',reading:'つぼみ',ipa:'/ˈflaʊ.ər bʌd/',
 zhDef:'尚未開放、花瓣仍包合的花芽；本圖以櫻花花苞呈現。',enDef:'An unopened flower; the image shows cherry blossom buds.',jaDef:'まだ開いていない花。この項目の絵は桜のつぼみを示す。',
 reasons:['つぼみ是未開的花，圖像指定櫻花花苞而不把一般詞義限制為櫻花；純假名讀音一致。','近看花苞顏色是可想像的觀察情境；pink／ピンク／粉紅三語一致。','花苞仍閉合使人延後到下週再來，まだ／ので／来週包含時間與原因，與顏色觀察形成難度差。'],
 ex:[
 ['The flower buds are pink.','つぼみはピンクです。','花苞是粉紅色的。',
 ['The ',S('flower buds','花苞','つぼみ','flower buds'),' are ',S('pink','粉紅色','ピンク','pink'),'.'],
 [S('つぼみ','花苞','つぼみ','flower buds','つぼみ'),'は',S('ピンク','粉紅色','ピンク','pink','ぴんく'),'です。']],
 ['The flower buds were still closed, so we decided to come back next week.','つぼみがまだ開いていなかったので、来週また来ることにしました。','花苞還沒開，所以我們決定下週再來。',
 ['The ',S('flower buds','花苞','つぼみ','flower buds'),' were ',S('still','還','まだ','still'),' ',S('closed','未開的','開いていない','closed'),', so we ',S('decided','決定了','決めました','decided'),' to ',S('come back','再來','また来る','come back'),' ',S('next week','下週','来週','next week'),'.'],
 [S('つぼみ','花苞','つぼみ','flower buds','つぼみ'),'が',S('まだ','還','まだ','still','まだ'),S('開いていなかった','還沒開','開いていなかった','had not opened','ひらいていなかった'),'ので、',S('来週','下週','来週','next week','らいしゅう'),S('また','再','また','again','また'),S('来ることにしました','決定要來','来ることにしました','decided to come','くることにしました'),'。']]
 ]
},
{
 id:'petal',word:'petal',chinese:'花瓣',ja:'花びら',reading:'はなびら',ipa:'/ˈpet.əl/',
 zhDef:'花朵上通常帶有顏色的薄片；本圖以末端有缺口的櫻花花瓣呈現。',enDef:'One of the usually colored parts around the center of a flower.',jaDef:'花を構成する、色の付いた薄い部分。この項目の絵は桜の花びらを示す。',
 reasons:['花びら是花朵的單片而非整朵；櫻花花瓣末端凹口作辨識特徵，讀音はなびら正確。','花瓣掉在肩上是賞櫻時自然遇到的單一事件；沒有把花瓣當整朵花。','拍照前取走頭髮上的花瓣，三語保留先後、頭髮與拍照；複句增加時間關係。'],
 ex:[
 ['A petal fell on my shoulder.','肩に花びらが落ちました。','一片花瓣落在我的肩膀上。',
 ['A ',S('petal','花瓣','花びら','petal'),' ',S('fell','落下了','落ちました','fell'),' on my ',S('shoulder','肩膀','肩','shoulder'),'.'],
 [S('肩','肩膀','肩','shoulder','かた'),'に',S('花びら','花瓣','花びら','petal','はなびら'),'が',S('落ちました','落下了','落ちました','fell','おちました'),'。']],
 ['Before taking a photo, I removed the petals from my hair.','写真を撮る前に、髪についた花びらを取りました。','拍照前，我拿掉了黏在頭髮上的花瓣。',
 ['Before ',S('taking','拍攝','撮る','taking'),' a ',S('photo','照片','写真','photo'),', I ',S('removed','拿掉了','取りました','removed'),' the ',S('petals','花瓣','花びら','petals'),' from my ',S('hair','頭髮','髪','hair'),'.'],
 [S('写真','照片','写真','photo','しゃしん'),'を',S('撮る','拍攝','撮る','take','とる'),'前に、',S('髪','頭髮','髪','hair','かみ'),'に',S('ついた','黏上的','ついた','stuck','ついた'),S('花びら','花瓣','花びら','petals','はなびら'),'を',S('取りました','拿掉了','取りました','removed','とりました'),'。']]
 ]
},
{
 id:'cherry-blossom-viewing',word:'cherry blossom viewing',chinese:'賞櫻',ja:'花見',reading:'はなみ',ipa:'/ˈtʃer.i ˌblɑː.səm ˈvjuː.ɪŋ/',
 zhDef:'欣賞盛開櫻花的活動，可散步觀賞，也可在允許的地方野餐。',enDef:'The activity of enjoying cherry blossoms, sometimes with a picnic.',jaDef:'桜などの花を見て楽しむこと。散歩したり、許可された場所で食事をしたりする。',
 reasons:['花見在本系列用於賞櫻；定義容納散步與野餐，不誤說一定喝酒或聚餐。','邀朋友去賞櫻是簡短可用的邀約，三語人物與活動相同。','因公園禁止飲食而邊走邊賞櫻，原因與ながら的同時活動明確；沒有鼓勵違反公園規則。'],
 ex:[
 ["Let's go cherry blossom viewing with our friends.",'友達と花見に行きましょう。','一起和朋友去賞櫻吧。',
 ["Let's ",S('go','去','行きましょう','go'),' ',S('cherry blossom viewing','賞櫻','花見','cherry blossom viewing'),' with our ',S('friends','朋友','友達','friends'),'.'],
 [S('友達','朋友','友達','friends','ともだち'),'と',S('花見','賞櫻','花見','cherry blossom viewing','はなみ'),'に',S('行きましょう','一起去吧','行きましょう',"let's go",'いきましょう'),'。']],
 ['Food and drink were not allowed in the park, so we enjoyed cherry blossom viewing while walking.','公園では飲食が禁止されていたので、歩きながら花見を楽しみました。','公園禁止飲食，所以我們邊走邊賞櫻。',
 [S('Food','食物','食べ物','food'),' and ',S('drink','飲料','飲み物','drink'),' were not ',S('allowed','允許的','許可された','allowed'),' in the ',S('park','公園','公園','park'),', so we ',S('enjoyed','享受了','楽しみました','enjoyed'),' ',S('cherry blossom viewing','賞櫻','花見','cherry blossom viewing'),' while ',S('walking','走路','歩く','walking'),'.'],
 [S('公園','公園','公園','park','こうえん'),'では',S('飲食','飲食','飲食','eating and drinking','いんしょく'),'が',S('禁止されていた','當時被禁止','禁止されていた','was prohibited','きんしされていた'),'ので、',S('歩きながら','邊走路','歩きながら','while walking','あるきながら'),S('花見','賞櫻','花見','cherry blossom viewing','はなみ'),'を',S('楽しみました','享受了','楽しみました','enjoyed','たのしみました'),'。']]
 ]
},
{
 id:'night-cherry-blossoms',word:'cherry blossoms at night',chinese:'夜櫻',ja:'夜桜',reading:'よざくら',ipa:'/ˈtʃer.i ˌblɑː.səmz ət naɪt/',
 zhDef:'夜間觀賞的櫻花，常配合照明呈現；不是另一種櫻花品種。',enDef:'Cherry blossoms seen at night, often illuminated for viewing.',jaDef:'夜に見る桜の花。ライトアップされることもあるが、特定の品種の名前ではない。',
 reasons:['夜桜表示夜間櫻花而非花種，英文完整加 at night，よざくら涵蓋連濁。','晚間拍夜櫻直接使用概念，英文 at night 與夜桜等義。','因照明八點結束而提早出發，三語保留八點、結束與提早的因果；無虛構特定景點時刻。'],
 ex:[
 ['I took photos of the cherry blossoms at night.','夜桜の写真を撮りました。','我拍了夜櫻的照片。',
 ['I ',S('took','拍了','撮りました','took'),' ',S('photos','照片','写真','photos'),' of the ',S('cherry blossoms','櫻花','桜','cherry blossoms'),' at ',S('night','夜晚','夜','night'),'.'],
 [S('夜桜','夜櫻','夜桜','cherry blossoms at night','よざくら'),'の',S('写真','照片','写真','photos','しゃしん'),'を',S('撮りました','拍了','撮りました','took','とりました'),'。']],
 ['The lights were due to go off at eight, so we left early to see the cherry blossoms at night.','ライトアップが八時に終わる予定だったので、夜桜を見るために早めに出発しました。','照明預定八點結束，所以我們提早出發去看夜櫻。',
 ['The ',S('lights','照明','ライトアップ','lights'),' were due to ',S('go off','熄滅','消える','go off'),' at ',S('eight','八點','八時','eight'),', so we ',S('left','出發了','出発しました','left'),' ',S('early','提早','早めに','early'),' to ',S('see','看','見る','see'),' the ',S('cherry blossoms','櫻花','桜','cherry blossoms'),' at ',S('night','夜晚','夜','night'),'.'],
 [S('ライトアップ','照明','ライトアップ','illumination','らいとあっぷ'),'が',S('八時','八點','八時','eight o\'clock','はちじ'),'に',S('終わる予定だった','原定要結束','終わる予定だった','was due to end','おわるよていだった'),'ので、',S('夜桜','夜櫻','夜桜','cherry blossoms at night','よざくら'),'を',S('見る','看','見る','see','みる'),'ために',S('早めに','提早','早めに','early','はやめに'),S('出発しました','出發了','出発しました','left','しゅっぱつしました'),'。']]
 ]
},
{
 id:'cherry-tree-avenue',word:'cherry tree avenue',chinese:'櫻花林蔭道',ja:'桜並木',reading:'さくらなみき',ipa:'/ˈtʃer.i triː ˈæv.ə.nuː/',
 zhDef:'沿道路或步道成排種植櫻樹所形成的林蔭道。',enDef:'A road or path lined with cherry trees.',jaDef:'道などに沿って桜の木が並んでいるところ。',
 reasons:['桜並木的核心是沿路成排櫻樹，英文 avenue 不限定車道；與單棵櫻樹和公園區分。','沿櫻花林蔭道散步具體呈現空間用法，三語都是步行而非搭車。','較遠仍選擇走櫻花林蔭道到車站，遠回り／longer way／繞遠路與讓步一致。'],
 ex:[
 ['We walked along the cherry tree avenue.','桜並木を歩きました。','我們沿著櫻花林蔭道走。',
 ['We ',S('walked','走了','歩きました','walked'),' along the ',S('cherry tree avenue','櫻花林蔭道','桜並木','cherry tree avenue'),'.'],
 [S('桜並木','櫻花林蔭道','桜並木','cherry tree avenue','さくらなみき'),'を',S('歩きました','走了','歩きました','walked','あるきました'),'。']],
 ['Although it was the longer way, we took the cherry tree avenue to the station.','遠回りでしたが、桜並木を通って駅まで行きました。','雖然繞遠路，我們還是沿著櫻花林蔭道去了車站。',
 ['Although it was the ',S('longer','較遠的','遠回りの','longer'),' ',S('way','路線','道','way'),', we ',S('took','走了','通りました','took'),' the ',S('cherry tree avenue','櫻花林蔭道','桜並木','cherry tree avenue'),' to the ',S('station','車站','駅','station'),'.'],
 [S('遠回りでした','繞遠路','遠回りでした','was the longer way','とおまわりでした'),'が、',S('桜並木','櫻花林蔭道','桜並木','cherry tree avenue','さくらなみき'),'を',S('通って','經過','通って','via','とおって'),S('駅','車站','駅','station','えき'),'まで',S('行きました','去了','行きました','went','いきました'),'。']]
 ]
},
{
 id:'sakura-mochi',word:'sakura mochi',chinese:'櫻餅',ja:'桜餅',reading:'さくらもち',ipa:'/ˌsɑː.kʊ.rə ˈmoʊ.tʃi/',
 zhDef:'以鹽漬櫻葉包裹、內含豆沙的日式甜點；有薄皮捲餡與道明寺米粒外皮等形式，本圖呈現後者。',enDef:'A Japanese sweet with bean paste wrapped in a pickled cherry leaf; this image shows the grainy Domyoji style.',jaDef:'あんを包んだ生地を塩漬けの桜の葉で巻いた和菓子。薄焼きの皮を使うものや、道明寺粉を使うものがあり、絵は後者を示す。',
 reasons:['依農林水產省區分薄皮長命寺與粒狀道明寺，定義不把所有桜餅都寫成糯米球；圖指定道明寺。','茶配櫻餅是常見食用場景，英文 tea 不擅加綠茶種類，三語一致。','吃之前剝下葉子是個人行為，未斷言櫻葉不可食；時間與wrapped修飾關係三語一致。'],
 ex:[
 ['I ate sakura mochi with tea.','お茶と一緒に桜餅を食べました。','我配著茶吃了櫻餅。',
 ['I ',S('ate','吃了','食べました','ate'),' ',S('sakura mochi','櫻餅','桜餅','sakura mochi'),' with ',S('tea','茶','お茶','tea'),'.'],
 [S('お茶','茶','お茶','tea','おちゃ'),'と',S('一緒に','一起','一緒に','together','いっしょに'),S('桜餅','櫻餅','桜餅','sakura mochi','さくらもち'),'を',S('食べました','吃了','食べました','ate','たべました'),'。']],
 ['Before eating my sakura mochi, I peeled off the leaf wrapped around it.','桜餅を食べる前に、周りに巻いてある葉をはがしました。','吃櫻餅前，我剝下了包在外面的葉子。',
 ['Before ',S('eating','吃','食べる','eating'),' my ',S('sakura mochi','櫻餅','桜餅','sakura mochi'),', I ',S('peeled off','剝下了','はがしました','peeled off'),' the ',S('leaf','葉子','葉','leaf'),' ',S('wrapped','包裹的','巻いてある','wrapped'),' around it.'],
 [S('桜餅','櫻餅','桜餅','sakura mochi','さくらもち'),'を',S('食べる','吃','食べる','eat','たべる'),'前に、',S('周り','周圍','周り','outside','まわり'),'に',S('巻いてある','包著的','巻いてある','wrapped','まいてある'),S('葉','葉子','葉','leaf','は'),'を',S('はがしました','剝下了','はがしました','peeled off','はがしました'),'。']]
 ]
},
{
 id:'hanami-dango',word:'hanami dango',chinese:'花見糰子',ja:'花見団子',reading:'はなみだんご',ipa:'/hɑːˈnɑː.mi ˈdɑːŋ.ɡoʊ/',
 zhDef:'賞櫻季節常見的串糰子，通常一串各有粉紅、白、綠三色各一顆。',enDef:'Skewered rice dumplings associated with cherry blossom viewing, usually pink, white, and green.',jaDef:'花見の時期に親しまれる串団子。一般にピンク、白、緑の三色の団子を一串に刺す。',
 reasons:['花見団子具體對應粉紅白綠三色串糰子；不與醬油みたらし団子混同，はなみだんご讀音完整。','以三色描述手中糰子，教學內容直接且不引入色彩象徵等未證實說法。','商店快關門而先買糰子，因果、先に與關門將近三語一致；與描述色彩句不同。'],
 ex:[
 ['The hanami dango has three colors.','花見団子には三つの色があります。','花見糰子有三種顏色。',
 ['The ',S('hanami dango','花見糰子','花見団子','hanami dango'),' has ',S('three','三種','三つ','three'),' ',S('colors','顏色','色','colors'),'.'],
 [S('花見団子','花見糰子','花見団子','hanami dango','はなみだんご'),'には',S('三つ','三種','三つ','three','みっつ'),'の',S('色','顏色','色','colors','いろ'),'があります。']],
 ['The shop was about to close, so I bought hanami dango first.','店がもうすぐ閉まるので、先に花見団子を買いました。','店快關門了，所以我先買了花見糰子。',
 ['The ',S('shop','店','店','shop'),' was about to ',S('close','關門','閉まる','close'),', so I ',S('bought','買了','買いました','bought'),' ',S('hanami dango','花見糰子','花見団子','hanami dango'),' ',S('first','先','先に','first'),'.'],
 [S('店','店','店','shop','みせ'),'が',S('もうすぐ','快要','もうすぐ','soon','もうすぐ'),S('閉まる','關門','閉まる','close','しまる'),'ので、',S('先に','先','先に','first','さきに'),S('花見団子','花見糰子','花見団子','hanami dango','はなみだんご'),'を',S('買いました','買了','買いました','bought','かいました'),'。']]
 ]
},
{
 id:'picnic-sheet',word:'picnic sheet',chinese:'野餐墊',ja:'レジャーシート',reading:'れじゃーしーと',ipa:'/ˈpɪk.nɪk ʃiːt/',
 zhDef:'鋪在戶外地面上坐或放置物品的墊布；日本常見輕薄防水形式。',enDef:'A ground sheet spread outdoors for sitting or placing picnic items.',jaDef:'屋外で座ったり荷物を置いたりするために、地面に敷くシート。',
 reasons:['レジャーシート為日本常用戶外地墊名稱；英文 picnic sheet 不誤作床單，圖以薄防水墊呈現。','鋪墊子是直接可實作請求；省略日文地點仍與英文簡單請求一致。','草地濕所以先擦墊底再摺，三語保持濕草原因、底面與先後；不是只拉長簡單句。'],
 ex:[
 ['Please spread out the picnic sheet.','レジャーシートを広げてください。','請鋪開野餐墊。',
 ['Please ',S('spread out','鋪開','広げてください','spread out'),' the ',S('picnic sheet','野餐墊','レジャーシート','picnic sheet'),'.'],
 [S('レジャーシート','野餐墊','レジャーシート','picnic sheet','れじゃーしーと'),'を',S('広げてください','請鋪開','広げてください','please spread out','ひろげてください'),'。']],
 ['The grass was wet, so I wiped the bottom of the picnic sheet before folding it.','草がぬれていたので、レジャーシートの裏を拭いてから畳みました。','草是濕的，所以我先擦了野餐墊的底面，再把它摺起來。',
 ['The ',S('grass','草','草','grass'),' was ',S('wet','濕的','ぬれている','wet'),', so I ',S('wiped','擦了','拭きました','wiped'),' the ',S('bottom','底面','裏','bottom'),' of the ',S('picnic sheet','野餐墊','レジャーシート','picnic sheet'),' before ',S('folding','摺疊','畳む','folding'),' it.'],
 [S('草','草','草','grass','くさ'),'が',S('ぬれていた','當時是濕的','ぬれていた','was wet','ぬれていた'),'ので、',S('レジャーシート','野餐墊','レジャーシート','picnic sheet','れじゃーしーと'),'の',S('裏','底面','裏','underside','うら'),'を',S('拭いて','擦拭','拭いて','wiped','ふいて'),'から',S('畳みました','摺起來了','畳みました','folded','たたみました'),'。']]
 ]
},
{
 id:'tiered-lunch-box',word:'tiered lunch box',chinese:'重箱便當盒',ja:'重箱',reading:'じゅうばこ',ipa:'/tɪrd ˈlʌntʃ bɑːks/',
 zhDef:'可上下堆疊的日式食盒，常用來裝節慶或多人分享的料理；此處用於賞櫻便當。',enDef:'A Japanese food box with stacking tiers, used for shared meals and special occasions.',jaDef:'料理を入れる、同じ形の箱を上下に重ねた容器。花見の弁当や正月料理などに使う。',
 reasons:['重箱為上下堆疊食盒，與既有一般便當盒區分；じゅうばこ為正確連濁，不將用途限於賞櫻。','把飯糰裝入重箱是準備賞櫻餐食的具體動作，三語一致。','因重箱沉重而提議分開搬運各層，理由與提議三語對應，表現可拆疊構造並區別於裝食物句。'],
 ex:[
 ['I packed rice balls in the tiered lunch box.','重箱におにぎりを詰めました。','我把飯糰裝進重箱便當盒。',
 ['I ',S('packed','裝了','詰めました','packed'),' ',S('rice balls','飯糰','おにぎり','rice balls'),' in the ',S('tiered lunch box','重箱便當盒','重箱','tiered lunch box'),'.'],
 [S('重箱','重箱便當盒','重箱','tiered lunch box','じゅうばこ'),'に',S('おにぎり','飯糰','おにぎり','rice balls','おにぎり'),'を',S('詰めました','裝進了','詰めました','packed','つめました'),'。']],
 ['The tiered lunch box is heavy, so let\'s carry the tiers separately.','重箱が重いので、段を分けて運びましょう。','重箱便當盒很重，我們把各層分開搬吧。',
 ['The ',S('tiered lunch box','重箱便當盒','重箱','tiered lunch box'),' is ',S('heavy','重的','重い','heavy'),', so let\'s ',S('carry','搬運','運びましょう','carry'),' the ',S('tiers','各層','段','tiers'),' ',S('separately','分開地','分けて','separately'),'.'],
 [S('重箱','重箱便當盒','重箱','tiered lunch box','じゅうばこ'),'が',S('重い','很重','重い','heavy','おもい'),'ので、',S('段','各層','段','tiers','だん'),'を',S('分けて','分開','分けて','separately','わけて'),S('運びましょう','一起搬吧','運びましょう',"let's carry",'はこびましょう'),'。']]
 ]
}
];
const corpus={en:{},ja:{}};
const notes=[];
const entries=rows.map(row=>{
 const examples=row.ex.map(([en,ja,zh,es,js],slot)=>{
  for(const [lang,text,spans] of [['en',en,es],['ja',ja,js]]){
   const normalized=spans.map(s=>typeof s==='string'?{t:s}:s);
   if(normalized.map(s=>s.t).join('')!==text)throw Error(`${row.id}:${slot}:${lang}: sentence mismatch`);
   if(corpus[lang][text])throw Error('duplicate sentence');
   corpus[lang][text]=normalized;
  }
  return {en,ja,zh,cefrLevel:slot?'B1':'A2'};
 });
 notes.push({wordId:row.id,wordReason:row.reasons[0],exampleReasons:row.reasons.slice(1)});
 return {id:row.id,word:row.word,chinese:row.chinese,chineseDefinition:row.zhDef,category:series,partOfSpeech:'noun',pronunciation:row.ipa,cefrLevel:'B1',definitions:[{language:'zh',definition:row.chinese,sortOrder:0},{language:'en',definition:row.enDef,sortOrder:0},{language:'ja',definition:row.jaDef,sortOrder:0}],examples,relatedWords:[],ja:row.ja,jaReading:row.reading,jaReadingSegments:[{text:row.ja,ruby:row.reading}],imageUrl:''};
});
const category={id:series,name:'Cherry Blossom Season',nameZh:'櫻花季',nameJa:'桜の季節',emoji:'🌸',description:'從櫻花與賞櫻風景到春日甜點和野餐用品',descriptionEn:'Cherry blossoms, flower viewing, spring sweets, and picnic essentials',descriptionJa:'桜の花や花見の風景、春の和菓子とピクニック用品',color:'from-pink-100 to-rose-100',imageUrl:''};
const references=[
 'https://www.japan.travel/en/sg/story/time-japans-favourite-spring-activity-hanami-manners-and-what-br/',
 'https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/39_26_osaka.html',
 'https://www.japan.travel/en/sg/guide/sakura-flavoured-sweets-spring/'
];
const write=(file,v)=>fs.writeFileSync(file,JSON.stringify(v,null,2)+'\n');
const candidatePath=`data/${series}-series-2026-10.json`;
if(fs.existsSync(candidatePath))throw Error('Refusing to overwrite candidate; edit reviewed JSON in place.');
write(candidatePath,{schemaVersion:1,series,state:'authored-local-candidate',scopeNote:'Local only. Uploads, production DB writes, commit and deployment need separate authorization.',category,references,entries});
write(`data/example-spans-${series}-2026-10.json`,corpus);
write(`data/${series}-editorial-notes-2026-10.json`,{reviewer:'Codex, individual editorial review',references,entries:notes});
console.log({words:entries.length,examples:entries.length*2,sentences:Object.keys(corpus.en).length+Object.keys(corpus.ja).length});
