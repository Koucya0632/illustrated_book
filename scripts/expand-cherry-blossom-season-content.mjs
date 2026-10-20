// Individually authored expansion. Local files only; refuses a second append.
import fs from 'node:fs';
const series='cherry-blossom-season';
const S=(t,z,j,e,r)=>({t,z,j,e,...(r?{r}:{})});
const rows=[
{
 id:'weeping-cherry-tree',word:'weeping cherry tree',zh:'垂枝櫻',ja:'しだれ桜',reading:'しだれざくら',ipa:'/ˈwiː.pɪŋ ˈtʃer.i triː/',
 zhDef:'枝條細長下垂的櫻樹類型，花開時常形成垂落的花幕。',enDef:'A cherry tree with long branches that hang downward.',jaDef:'細い枝が下に垂れる桜の総称。花が咲くと、枝に沿って花が垂れ下がって見える。',
 reasons:['しだれ桜指枝條下垂的櫻樹類型，定義未誤說只有單一品種或顏色；しだれざくら的濁音與字面完整相符。','在垂枝櫻下會合是清楚的日常地點用法；三語都保留樹下與碰面，單一事件適合A2。','枝低垂導致彎腰通過，三語保留低枝、彎腰與樹下路徑，原因複句與簡單會合句用途不同。'],
 ex:[
 ['We met under the weeping cherry tree.','しだれ桜の下で会いました。','我們在垂枝櫻下碰面。',
 ['We ',S('met','碰面了','会いました','met'),' under the ',S('weeping cherry tree','垂枝櫻','しだれ桜','weeping cherry tree'),'.'],
 [S('しだれ桜','垂枝櫻','しだれ桜','weeping cherry tree','しだれざくら'),'の',S('下','下方','下','underneath','した'),'で',S('会いました','碰面了','会いました','met','あいました'),'。']],
 ['The branches hung low, so we bent down to pass under the weeping cherry tree.','枝が低く垂れていたので、かがんでしだれ桜の下を通りました。','枝條低垂，所以我們彎下腰從垂枝櫻下通過。',
 ['The ',S('branches','枝條','枝','branches'),' ',S('hung','垂著','垂れていた','hung'),' ',S('low','低低地','低く','low'),', so we ',S('bent down','彎下腰','かがみました','bent down'),' to ',S('pass','通過','通る','pass'),' under the ',S('weeping cherry tree','垂枝櫻','しだれ桜','weeping cherry tree'),'.'],
 [S('枝','枝條','枝','branches','えだ'),'が',S('低く','低低地','低く','low','ひくく'),S('垂れていた','垂著','垂れていた','were hanging','たれていた'),'ので、',S('かがんで','彎下腰','かがんで','bending down','かがんで'),S('しだれ桜','垂枝櫻','しだれ桜','weeping cherry tree','しだれざくら'),'の',S('下','下方','下','underneath','した'),'を',S('通りました','通過了','通りました','passed','とおりました'),'。']]
 ]
},
{
 id:'double-flowered-cherry',word:'double-flowered cherry',zh:'八重櫻',ja:'八重桜',reading:'やえざくら',ipa:'/ˌdʌb.əl ˈflaʊ.ərd ˈtʃer.i/',
 zhDef:'花瓣層數較多、呈重瓣花形的櫻花總稱，不只指某一個品種。',enDef:'A cherry with blossoms that have multiple layers of petals, rather than just five petals.',jaDef:'花びらが何枚も重なって咲く桜の総称。特定の一つの品種だけを指す名前ではない。',
 reasons:['八重桜為重瓣櫻花總稱；英語double-flowered不解釋成恰好十瓣，定義容納多層花瓣與不同品種。','拍攝八重櫻照片是簡明真實用法，三語主體一致，照片與拍攝動詞分開可點。','其他櫻花已落而八重櫻仍開，對比限於當次觀察，未宣稱所有八重櫻必定晚開；三語保留讓步與仍然。'],
 ex:[
 ['I photographed the double-flowered cherry.','八重桜の写真を撮りました。','我拍了八重櫻的照片。',
 ['I ',S('photographed','拍攝了','写真を撮りました','photographed'),' the ',S('double-flowered cherry','八重櫻','八重桜','double-flowered cherry'),'.'],
 [S('八重桜','八重櫻','八重桜','double-flowered cherry','やえざくら'),'の',S('写真','照片','写真','photo','しゃしん'),'を',S('撮りました','拍了','撮りました','took','とりました'),'。']],
 ['The double-flowered cherry was still blooming, although the other cherry trees had lost their flowers.','ほかの桜は散っていましたが、八重桜はまだ咲いていました。','其他櫻花已經凋落了，但八重櫻還在開花。',
 ['The ',S('double-flowered cherry','八重櫻','八重桜','double-flowered cherry'),' was ',S('still','還','まだ','still'),' ',S('blooming','開花','咲いている','blooming'),', although the ',S('other','其他的','ほかの','other'),' ',S('cherry trees','櫻樹','桜','cherry trees'),' had ',S('lost','落掉了','散らした','lost'),' their ',S('flowers','花朵','花','flowers'),'.'],
 [S('ほか','其他','ほか','others','ほか'),'の',S('桜','櫻花','桜','cherry blossoms','さくら'),'は',S('散っていました','已凋落了','散っていました','had fallen','ちっていました'),'が、',S('八重桜','八重櫻','八重桜','double-flowered cherry','やえざくら'),'は',S('まだ','還','まだ','still','まだ'),S('咲いていました','還在開花','咲いていました','was blooming','さいていました'),'。']]
 ]
},
{
 id:'full-bloom',word:'full bloom',zh:'滿開',ja:'満開',reading:'まんかい',ipa:'/fʊl bluːm/',
 zhDef:'一棵樹或一片花木的大部分花朵已盛開的狀態；本系列以櫻花呈現。',enDef:'The stage when most flowers on a tree or plant are fully open.',jaDef:'木や植物の花がほぼ咲きそろった状態。この項目では桜の満開を扱う。',
 reasons:['満開是開花狀態而非櫻花品種；英文full bloom以in full bloom入句，未把滿開誤定為每一朵百分之百都開。','桜が満開です直接表達眼前狀態，英語與繁中相同，兩個語言各有至少兩個詞塊。','看到櫻花滿開而更改行程，原因與結果三語一致，實際旅行決策使複句有新教學用途。'],
 ex:[
 ['The cherry trees are in full bloom.','桜が満開です。','櫻花滿開了。',
 ['The ',S('cherry trees','櫻樹','桜','cherry trees'),' are in ',S('full bloom','滿開','満開','full bloom'),'.'],
 [S('桜','櫻花','桜','cherry blossoms','さくら'),'が',S('満開','滿開','満開','full bloom','まんかい'),'です。']],
 ['We changed our plans because the cherry trees were in full bloom.','桜が満開だったので、予定を変更しました。','因為櫻花滿開了，我們更改了行程。',
 ['We ',S('changed','更改了','変更しました','changed'),' our ',S('plans','行程','予定','plans'),' because the ',S('cherry trees','櫻樹','桜','cherry trees'),' were in ',S('full bloom','滿開','満開','full bloom'),'.'],
 [S('桜','櫻花','桜','cherry blossoms','さくら'),'が',S('満開','滿開','満開','full bloom','まんかい'),'だったので、',S('予定','行程','予定','plans','よてい'),'を',S('変更しました','更改了','変更しました','changed','へんこうしました'),'。']]
 ]
},
{
 id:'cherry-blossom-shower',word:'cherry blossom shower',zh:'櫻吹雪',ja:'花吹雪',reading:'はなふぶき',ipa:'/ˈtʃer.i ˌblɑː.səm ˈʃaʊ.ər/',
 zhDef:'許多花瓣隨風飄落、像雪一樣飛舞的景象；通常用來形容櫻花。',enDef:'A shower of cherry blossom petals blowing through the air as they fall.',jaDef:'桜などの花びらが、雪のように風に舞いながら散る様子。',
 reasons:['花吹雪以空中飛舞落瓣為核心，與水面的花筏及一般掉落單片花瓣區分；英文shower在此為紛落而非下雨或淋浴。','走在櫻吹雪中是具體賞櫻經驗，三語同一動作，日文中／歩きました的讀音完整。','花瓣落在長椅上，先拂掉再坐，原因與先後關係三語保留；詞塊shower與brushed off皆依語境翻譯。'],
 ex:[
 ['We walked through a cherry blossom shower.','花吹雪の中を歩きました。','我們走在櫻吹雪之中。',
 ['We ',S('walked','走了','歩きました','walked'),' through a ',S('cherry blossom shower','櫻吹雪','花吹雪','cherry blossom shower'),'.'],
 [S('花吹雪','櫻吹雪','花吹雪','cherry blossom shower','はなふぶき'),'の',S('中','之中','中','amid','なか'),'を',S('歩きました','走了','歩きました','walked','あるきました'),'。']],
 ['A cherry blossom shower covered the bench, so I brushed off the petals before sitting down.','花吹雪でベンチに花びらが積もったので、座る前に払いました。','櫻吹雪讓長椅堆滿花瓣，所以我坐下前先把花瓣拂掉。',
 ['A ',S('cherry blossom shower','櫻吹雪','花吹雪','cherry blossom shower'),' ',S('covered','覆蓋了','覆いました','covered'),' the ',S('bench','長椅','ベンチ','bench'),', so I ',S('brushed off','拂掉了','払いました','brushed off'),' the ',S('petals','花瓣','花びら','petals'),' before ',S('sitting down','坐下','座る','sitting down'),'.'],
 [S('花吹雪','櫻吹雪','花吹雪','cherry blossom shower','はなふぶき'),'で',S('ベンチ','長椅','ベンチ','bench','べんち'),'に',S('花びら','花瓣','花びら','petals','はなびら'),'が',S('積もった','堆積了','積もった','piled up','つもった'),'ので、',S('座る','坐下','座る','sit down','すわる'),'前に',S('払いました','拂掉了','払いました','brushed off','はらいました'),'。']]
 ]
},
{
 id:'cherry-blossom-petal-raft',word:'raft of cherry blossom petals',zh:'花筏',ja:'花筏',reading:'はないかだ',ipa:'/ræft əv ˈtʃer.i ˌblɑː.səm ˈpet.əlz/',
 zhDef:'落在水面的櫻花花瓣聚集成片，像筏一樣漂浮的景象；不是木筏。',enDef:'A mass of fallen cherry blossom petals floating together on water.',jaDef:'水面に散った桜の花びらが集まり、いかだのように浮かぶ様子。',
 reasons:['花筏在本系列限定水面落櫻聚集景象，不混入同名植物或真木筏；英文直接交代petals防止單獨raft的誤義。','觀賞水面花筏是自然賞櫻活動，水面、花筏與眺めました分開，沒有將整句變成單一可點詞塊。','風向改變後花筏漂走，三語相同事件與時間觸發，流れていきました完整讀音包含所有活用。'],
 ex:[
 ['We watched the raft of cherry blossom petals on the water.','水面の花筏を眺めました。','我們觀賞了水面上的花筏。',
 ['We ',S('watched','觀賞了','眺めました','watched'),' the ',S('raft of cherry blossom petals','花筏','花筏','raft of cherry blossom petals'),' on the ',S('water','水面','水面','water'),'.'],
 [S('水面','水面','水面','water surface','すいめん'),'の',S('花筏','花筏','花筏','raft of cherry blossom petals','はないかだ'),'を',S('眺めました','觀賞了','眺めました','watched','ながめました'),'。']],
 ['The raft of cherry blossom petals drifted away when the wind changed direction.','風向きが変わると、花筏が流れていきました。','風向一變，花筏就漂走了。',
 ['The ',S('raft of cherry blossom petals','花筏','花筏','raft of cherry blossom petals'),' ',S('drifted away','漂走了','流れていきました','drifted away'),' when the ',S('wind','風','風','wind'),' ',S('changed','改變了','変わった','changed'),' ',S('direction','方向','向き','direction'),'.'],
 [S('風向き','風向','風向き','wind direction','かざむき'),'が',S('変わる','改變','変わる','change','かわる'),'と、',S('花筏','花筏','花筏','raft of cherry blossom petals','はないかだ'),'が',S('流れていきました','漂走了','流れていきました','drifted away','ながれていきました'),'。']]
 ]
},
{
 id:'cherry-blossom-festival',word:'cherry blossom festival',zh:'櫻花祭',ja:'桜まつり',reading:'さくらまつり',ipa:'/ˈtʃer.i ˌblɑː.səm ˈfes.tə.vəl/',
 zhDef:'以觀賞櫻花為主題的活動，依會場不同可有攤位、表演或夜間照明。',enDef:'An event celebrating cherry blossoms, sometimes with stalls, performances, or evening lights.',jaDef:'桜を楽しむための催し。会場によっては出店や催し物、ライトアップなどがある。',
 reasons:['桜まつり為活動名稱而非一般花見行為，定義以可能有攤位或活動表達差異，未宣稱每場一定有神輿或煙火。','在櫻花祭買點心可想像且日常，活動、點心與購買動詞三語一致。','活動擁擠而約在入口會合，因果與共同決定三語對應，混んでいた及待ち合わせることにしました讀音完整。'],
 ex:[
 ['We bought snacks at the cherry blossom festival.','桜まつりでおやつを買いました。','我們在櫻花祭買了點心。',
 ['We ',S('bought','買了','買いました','bought'),' ',S('snacks','點心','おやつ','snacks'),' at the ',S('cherry blossom festival','櫻花祭','桜まつり','cherry blossom festival'),'.'],
 [S('桜まつり','櫻花祭','桜まつり','cherry blossom festival','さくらまつり'),'で',S('おやつ','點心','おやつ','snacks','おやつ'),'を',S('買いました','買了','買いました','bought','かいました'),'。']],
 ['The cherry blossom festival was crowded, so we agreed to meet at the entrance.','桜まつりが混んでいたので、入口で待ち合わせることにしました。','櫻花祭人很多，所以我們約好在入口碰面。',
 ['The ',S('cherry blossom festival','櫻花祭','桜まつり','cherry blossom festival'),' was ',S('crowded','擁擠的','混んでいた','crowded'),', so we ',S('agreed','約好了','決めました','agreed'),' to ',S('meet','碰面','待ち合わせる','meet'),' at the ',S('entrance','入口','入口','entrance'),'.'],
 [S('桜まつり','櫻花祭','桜まつり','cherry blossom festival','さくらまつり'),'が',S('混んでいた','人很多','混んでいた','was crowded','こんでいた'),'ので、',S('入口','入口','入口','entrance','いりぐち'),'で',S('待ち合わせることにしました','約好要碰面','待ち合わせることにしました','agreed to meet','まちあわせることにしました'),'。']]
 ]
},
{
 id:'hanami-bento',word:'hanami bento',zh:'賞櫻便當',ja:'花見弁当',reading:'はなみべんとう',ipa:'/hɑːˈnɑː.mi ˈben.toʊ/',
 zhDef:'為賞櫻時享用而準備的便當，內容可有飯糰、配菜與春季食材；此詞指餐點，不是便當盒。',enDef:'A packed meal prepared to enjoy while viewing cherry blossoms.',jaDef:'花見のときに食べるために用意する弁当。おにぎりやおかずなどを詰めた食事で、容器そのものではない。',
 reasons:['花見弁当是賞櫻餐食，與前批重箱容器區分；定義不將某套食材強定為唯一標準。','在樹下吃賞櫻便當，三語保留地點與食用事件，適合作為A2單一生活用法。','朋友不能吃蝦而挑選無蝦便當，否定、人物與選擇原因三語一致；未擅加未提供的過敏診斷。'],
 ex:[
 ['We ate our hanami bento under a tree.','木の下で花見弁当を食べました。','我們在樹下吃了賞櫻便當。',
 ['We ',S('ate','吃了','食べました','ate'),' our ',S('hanami bento','賞櫻便當','花見弁当','hanami bento'),' under a ',S('tree','樹','木','tree'),'.'],
 [S('木','樹','木','tree','き'),'の',S('下','下方','下','underneath','した'),'で',S('花見弁当','賞櫻便當','花見弁当','hanami bento','はなみべんとう'),'を',S('食べました','吃了','食べました','ate','たべました'),'。']],
 ['I chose a hanami bento without shrimp because my friend cannot eat shrimp.','友達はエビが食べられないので、エビの入っていない花見弁当を選びました。','朋友不能吃蝦，所以我選了不含蝦的賞櫻便當。',
 ['I ',S('chose','選了','選びました','chose'),' a ',S('hanami bento','賞櫻便當','花見弁当','hanami bento'),' without ',S('shrimp','蝦','エビ','shrimp'),' because my ',S('friend','朋友','友達','friend'),' cannot ',S('eat','吃','食べる','eat'),' ',S('shrimp','蝦','エビ','shrimp'),'.'],
 [S('友達','朋友','友達','friend','ともだち'),'は',S('エビ','蝦','エビ','shrimp','えび'),'が',S('食べられない','不能吃','食べられない','cannot eat','たべられない'),'ので、',S('エビ','蝦','エビ','shrimp','えび'),'の',S('入っていない','不含','入っていない','not containing','はいっていない'),S('花見弁当','賞櫻便當','花見弁当','hanami bento','はなみべんとう'),'を',S('選びました','選了','選びました','chose','えらびました'),'。']]
 ]
},
{
 id:'cherry-blossom-tea',word:'cherry blossom tea',zh:'櫻花茶',ja:'桜湯',reading:'さくらゆ',ipa:'/ˈtʃer.i ˌblɑː.səm tiː/',
 zhDef:'將鹽漬櫻花放入熱水沖泡的飲品，也稱櫻湯；通常不含茶葉。',enDef:'A drink made by steeping salt-pickled cherry blossoms in hot water, usually without tea leaves.',jaDef:'塩漬けの桜の花を湯に浮かべた飲み物。一般に茶葉を使うお茶とは異なる。',
 reasons:['桜湯為鹽漬花加熱水的飲品，英語常稱tea但明寫通常無茶葉；不混入櫻葉茶或粉紅拿鐵。','杯中花朵泡開是可觀察的飲用經驗，三語皆指一朵花在飲品中綻開。','太鹹後加熱水是合理日常調整，しょっぱすぎた與too salty一致；沒有把飲品描寫成必然甜茶。'],
 ex:[
 ['A blossom opened in my cherry blossom tea.','桜湯の中で花が開きました。','一朵櫻花在我的櫻花茶裡綻開了。',
 ['A ',S('blossom','花朵','花','blossom'),' ',S('opened','綻開了','開きました','opened'),' in my ',S('cherry blossom tea','櫻花茶','桜湯','cherry blossom tea'),'.'],
 [S('桜湯','櫻花茶','桜湯','cherry blossom tea','さくらゆ'),'の',S('中','裡面','中','inside','なか'),'で',S('花','花朵','花','blossom','はな'),'が',S('開きました','綻開了','開きました','opened','ひらきました'),'。']],
 ['The cherry blossom tea was too salty, so I added more hot water.','桜湯がしょっぱすぎたので、お湯を足しました。','櫻花茶太鹹了，所以我又加了熱水。',
 ['The ',S('cherry blossom tea','櫻花茶','桜湯','cherry blossom tea'),' was ',S('too','太','すぎる','too'),' ',S('salty','鹹的','しょっぱい','salty'),', so I ',S('added','加了','足しました','added'),' more ',S('hot water','熱水','お湯','hot water'),'.'],
 [S('桜湯','櫻花茶','桜湯','cherry blossom tea','さくらゆ'),'が',S('しょっぱすぎた','太鹹了','しょっぱすぎた','was too salty','しょっぱすぎた'),'ので、',S('お湯','熱水','お湯','hot water','おゆ'),'を',S('足しました','又加了','足しました','added more','たしました'),'。']]
 ]
},
{
 id:'salt-pickled-cherry-blossoms',word:'salt-pickled cherry blossoms',zh:'鹽漬櫻花',ja:'桜の塩漬け',reading:'さくらのしおづけ',ipa:'/ˈsɔːlt ˌpɪk.əld ˈtʃer.i ˌblɑː.səmz/',
 zhDef:'用鹽等醃漬保存的食用櫻花，常用於櫻花茶、米飯或甜點；不是鹽漬櫻葉。',enDef:'Edible cherry blossoms preserved with salt, used in drinks, rice, or sweets.',jaDef:'桜の花を塩などで漬けて保存したもの。桜湯やご飯、菓子などに使われ、桜の葉の塩漬けとは別のもの。',
 reasons:['桜の塩漬け在此明確指食用花，不與前批櫻餅所用鹽漬葉混同；讀音しおづけ保留連濁。','購買鹽漬櫻花是單一日常購物動作，兩語皆有完整主詞概念與動詞詞塊。','先泡水再加入米飯是符合鹽漬食材用法的料理情境，三語順序一致，未夾入未查證的具體配方比例。'],
 ex:[
 ['I bought salt-pickled cherry blossoms.','桜の塩漬けを買いました。','我買了鹽漬櫻花。',
 ['I ',S('bought','買了','買いました','bought'),' ',S('salt-pickled cherry blossoms','鹽漬櫻花','桜の塩漬け','salt-pickled cherry blossoms'),'.'],
 [S('桜の塩漬け','鹽漬櫻花','桜の塩漬け','salt-pickled cherry blossoms','さくらのしおづけ'),'を',S('買いました','買了','買いました','bought','かいました'),'。']],
 ['I soaked the salt-pickled cherry blossoms in water before adding them to the rice.','桜の塩漬けを水に浸してから、ご飯に加えました。','我先把鹽漬櫻花泡在水裡，再加進米飯中。',
 ['I ',S('soaked','浸泡了','浸しました','soaked'),' the ',S('salt-pickled cherry blossoms','鹽漬櫻花','桜の塩漬け','salt-pickled cherry blossoms'),' in ',S('water','水','水','water'),' before ',S('adding','加入','加える','adding'),' them to the ',S('rice','米飯','ご飯','rice'),'.'],
 [S('桜の塩漬け','鹽漬櫻花','桜の塩漬け','salt-pickled cherry blossoms','さくらのしおづけ'),'を',S('水','水','水','water','みず'),'に',S('浸して','浸泡','浸して','soaked','ひたして'),'から、',S('ご飯','米飯','ご飯','rice','ごはん'),'に',S('加えました','加入了','加えました','added','くわえました'),'。']]
 ]
},
{
 id:'cherry-blossom-rice',word:'cherry blossom rice',zh:'櫻花飯',ja:'桜ご飯',reading:'さくらごはん',ipa:'/ˈtʃer.i ˌblɑː.səm raɪs/',
 zhDef:'加入食用鹽漬櫻花等製成的米飯，帶有櫻花香氣；此處指含櫻花的做法。',enDef:'Cooked rice flavored with edible salt-pickled cherry blossoms.',jaDef:'塩漬けの桜の花などを使い、桜の香りを付けたご飯。ここでは、桜の花を使う料理を指す。',
 reasons:['桜ご飯在此明定使用食用櫻花，避免與某些地方同名但不含櫻花的醬油飯混淆；圖像與例句皆限此義。','飯香很好是實際用餐感受，三語都描述香味，日文いい與香り為不同可點單位。','為了在電車上吃，把剩下櫻花飯做成飯糰，目的、剩飯與製作動作三語一致，對比簡單感受句有明確關係。'],
 ex:[
 ['The cherry blossom rice smells lovely.','桜ご飯はいい香りがします。','櫻花飯聞起來很香。',
 ['The ',S('cherry blossom rice','櫻花飯','桜ご飯','cherry blossom rice'),' ',S('smells','聞起來','香りがする','smells'),' ',S('lovely','很香的','いい香りの','lovely'),'.'],
 [S('桜ご飯','櫻花飯','桜ご飯','cherry blossom rice','さくらごはん'),'は',S('いい','好的','いい','pleasant','いい'),S('香り','香氣','香り','aroma','かおり'),'がします。']],
 ['I made rice balls with the leftover cherry blossom rice so we could eat them on the train.','電車で食べられるように、残った桜ご飯でおにぎりを作りました。','為了能在電車上吃，我把剩下的櫻花飯做成了飯糰。',
 ['I ',S('made','做了','作りました','made'),' ',S('rice balls','飯糰','おにぎり','rice balls'),' with the ',S('leftover','剩下的','残った','leftover'),' ',S('cherry blossom rice','櫻花飯','桜ご飯','cherry blossom rice'),' so we could ',S('eat','吃','食べる','eat'),' them on the ',S('train','電車','電車','train'),'.'],
 [S('電車','電車','電車','train','でんしゃ'),'で',S('食べられる','能吃','食べられる','can eat','たべられる'),'ように、',S('残った','剩下的','残った','leftover','のこった'),S('桜ご飯','櫻花飯','桜ご飯','cherry blossom rice','さくらごはん'),'で',S('おにぎり','飯糰','おにぎり','rice balls','おにぎり'),'を',S('作りました','做了','作りました','made','つくりました'),'。']]
 ]
}
];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const candidatePath=`data/${series}-series-2026-10.json`,spansPath=`data/example-spans-${series}-2026-10.json`,notesPath=`data/${series}-editorial-notes-2026-10.json`;
const candidate=read(candidatePath),spans=read(spansPath),notes=read(notesPath);
if(rows.some(r=>candidate.entries.some(e=>e.id===r.id)))throw Error('Expansion already present; edit reviewed JSON in place.');
// Preserve the earlier review and manifest before changing the candidate scope.
const archive='output/cherry-blossom-season-publish-prep/archive/10-words';fs.mkdirSync(archive,{recursive:true});
for(const name of ['publish-plan.json','REVIEW.md','release-ledger.json','image-manifest.json','semantic-review.json','visual-review.json']){
 const source=`output/cherry-blossom-season-publish-prep/${name}`,dest=`${archive}/${name}`;
 if(fs.existsSync(source)&&!fs.existsSync(dest))fs.copyFileSync(source,dest,fs.constants.COPYFILE_EXCL);
}
for(const row of rows){
 const examples=row.ex.map(([en,ja,zh,english,japanese],slot)=>{
  for(const[lang,text,list]of [['en',en,english],['ja',ja,japanese]]){
   const values=list.map(s=>typeof s==='string'?{t:s}:s);
   if(values.map(s=>s.t).join('')!==text)throw Error(`${row.id}:${slot}:${lang}: reconstruction mismatch`);
   if(spans[lang][text])throw Error(`${row.id}: sentence collision`);
   spans[lang][text]=values;
  }
  return {en,ja,zh,cefrLevel:slot?'B1':'A2'};
 });
 candidate.entries.push({id:row.id,word:row.word,chinese:row.zh,chineseDefinition:row.zhDef,category:series,partOfSpeech:'noun',pronunciation:row.ipa,cefrLevel:'B1',definitions:[{language:'zh',definition:row.zh,sortOrder:0},{language:'en',definition:row.enDef,sortOrder:0},{language:'ja',definition:row.jaDef,sortOrder:0}],examples,relatedWords:[],ja:row.ja,jaReading:row.reading,jaReadingSegments:[{text:row.ja,ruby:row.reading}],imageUrl:''});
 notes.entries.push({wordId:row.id,wordReason:row.reasons[0],exampleReasons:row.reasons.slice(1)});
}
const references=['https://www.japan.travel/en/sg/story/japan-cherry-blossom-season-types/','https://www.hirosakipark.jp/sakura/hanami/highlights/enjoy04/','https://www.maff.go.jp/j/keikaku/syokubunka/traditional-foods/menu/sakura_no_hana_zuke.html'];
candidate.references=[...new Set([...candidate.references,...references])];notes.references=[...new Set([...notes.references,...references])];
candidate.state='expanded-local-candidate';
write(candidatePath,candidate);write(spansPath,spans);write(notesPath,notes);
console.log({added:rows.length,totalWords:candidate.entries.length,examples:candidate.entries.length*2});
