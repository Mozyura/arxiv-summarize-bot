//必要なパッケージをインポートする
import { GatewayIntentBits, Client, Partials, Message, ApplicationCommandDataResolvable, Events, ComponentBuilder, TextChannel, ChannelType } from 'discord.js';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
import axios from 'axios';
import { xml2json } from 'xml-js';
import { ArxivParer, ArxivQuery, generateArxivURL } from './arxiv';
import { ConfigFormat } from './config';
const cron = require('node-cron');

//.envファイルを読み込む
dotenv.config();

//discord botのクライアント
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

//読み込んだjsonがオブジェクト型の時と配列型の時で処理を分岐させる
const jsonMakeArray = (instance: any) => {
  if (instance instanceof Array) {
    return instance;
  } else {
    return new Array(instance);
  }
}

//OpenAIのAPIキーを設定する
const configration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
//APIクライアントを生成
const openai = new OpenAIApi(configration);
//botが所属する全てのテキストチャンネルに
const sendAllTextChannel = async (text: string, channel_id: string[]) => {
  //登録されたidの数だけ繰り返す
  for (const id of channel_id as string[]) {
    const channel = client.channels.cache.get(id);
    //channelがundefinedでなく，かつTextChannelなら
    if (channel?.type === ChannelType.GuildText) {
      await channel.send(text);
    }
  }
}

const sendArxivPapers = (async () => {
  //channel idなどが定義されたjsonファイルを読み込み
  const config: ConfigFormat = require('../config.json');
  //arXivクエリの設定
  const search: ArxivQuery = {
    searchQuery: config.search_word,
    maxResults: "50",
    sortBy: "submittedDate",
    sortOrder: "descending",
  };
  //arXivに送るURLの生成
  const arxiv_url = generateArxivURL(search);
  //arXivからのレスポンスをjsonに変換して中身を取り出す
  const res_json = jsonMakeArray(JSON.parse(xml2json((await axios.get(arxiv_url)).data as string, { compact: true, spaces: 2 })).feed.entry);

  //検索クエリが適切であればなにかしらのデータが返ってくるはず
  if (res_json.length > 0) {
    //今日確認できる出版論文を確認する
    const today_papers = res_json.map(paper => {
      //著者名は複数にわたるので、文字列の配列として取り出す
      //ただし単著の際はObjectとして取り出されるようなので，処理を分岐
      const _author = jsonMakeArray(paper.author)
        .map(author => author.name._text as string);
      //出版日を日付で取り出す（そのまま取り出すとタイムゾーンやらで難しい）
      const _published = new Date((paper.published._text as string).split('T')[0]);

      //ArxivParer型のデータ構造に整形
      return {
        title: paper.title._text,
        link: paper.id._text,
        author: _author,
        summary: paper.summary._text,
        published: _published
      } as ArxivParer
    })
      //昨日出版された論文のみにフィルタリング
      .filter(paper => {
        //今日の日付情報
        const today = new Date();
        today.setDate(today.getDate())
        //昨日の日付情報
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        return yesterday < paper.published && paper.published < today;
      });
    
    //もし今日の新着論文がなければ、ないことを伝えて終了
    if (today_papers.length === 0) {
      //sendAllTextChannel("There were no new papers today.", config.channel_id);
      return;
    }

    
    for (const paper of today_papers) {
      const gpt_summary = await (async () => {
        try {
          const result = await openai.createChatCompletion({
            model: config.model,
            messages: [{ role: "user", content: (config.prompt as string).replace("{summary}", paper.summary) }],
          });

          return result.data.choices[0].message?.content.trim();
        } catch (error) {
          console.error(error);
          return `Failed to connect ChatGPT API.\nErrorContents: ${error}`;
        }
      })();

      const message = `**Title:**  ${paper.title}\n\n`
        + "**Authors:**  " + paper.author.map(au => `${au}`) + "\n\n"
        + `**Summary:** ${gpt_summary}\n`
        + `${paper.link}\n`

      sendAllTextChannel(message, config.channel_id as string[]);
    }
  }
});

//DiscordBotがきちんと起動したか確認
client.once(Events.ClientReady, async () => {
  //設定ファイルを読み込み
  const config: ConfigFormat = require('../config.json');
  //botのコマンドを設定
  const commands = [
    {
      name: "flush",
      description: "Force invocation of today's notification.\n",
    }
  ]
  await client.application?.commands.set(commands);

  console.log('Ready!');
  //所属するチャンネル全てにreadyを送信
  //sendAllTextChannel('Ready!', config.channel_id);
  if (client.user) {
    console.log(client.user.tag);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if(!interaction.isCommand()) return;

  const command = interaction.commandName;
  if(command === "flush") {
    await interaction.deferReply();
    await sendArxivPapers();
    //await interaction.editReply("Succcess!");
  }
});

//毎日11時に投稿するように設定
cron.schedule('0 0 11 * * *', () => {
  sendArxivPapers();
});

//ボット作成時のトークンでDiscordと接続
client.login(process.env.BOT_TOKEN);