//必要なパッケージをインポートする
import { GatewayIntentBits, Client, Partials, Message, ApplicationCommandDataResolvable, Events, ComponentBuilder, TextChannel, ChannelType, Interaction, CacheType, GuildMember } from 'discord.js';
import { Configuration, OpenAIApi } from 'openai';
import dotenv, { config } from 'dotenv';
import axios from 'axios';
import { xml2json } from 'xml-js';
import { ArxivParer, ArxivQuery, generateArxivURL } from './arxiv';
import { ChannelMessage, ChannelSetting } from './config';
import cron from 'node-cron';
import fs from 'fs';
import { channel } from 'diagnostics_channel';
import { RequiredError } from 'openai/dist/base';

//.envファイルを読み込む
dotenv.config();

//////////////定数の宣言/////////////////
const config_path = './config.json';
const search_option_name = "論文検索ワード";
const prompt_option_name = "プロンプト設定";
const model_option_name = "言語モデル指定";
const max_option_name = "一回で生成される論文数の上限"

//必要なロールの名前
const server_manager_name = "server manager";
const bot_manager_name = "bot manager";

//botのコマンド設定に必要なデータ
const command_data = [
  {
    name: "status",
    description: "論文要約botの設定が確認できます"
  },
  {
    name: "run",
    description: "要bot manager：17時でなくても即座に論文が要約されます(動作確認用コマンド)",
  },
  {
    name: "setwords",
    description: "要server manager：論文検索ワードを設定します",
    options: [
      {
        type: 3,
        name: search_option_name,
        description: "追加したい論文検索ワードを半角カンマ(,)区切りで入力してください",
        required: true,
        max_length: 300
      }
    ]
  },
  {
    name: "setprompt",
    description: "要server manager：ChatGPTへ投稿する内容を調整できます",
    options: [
      {
        type: 3,
        name: prompt_option_name,
        description: "ChatGPTへ投稿する内容を調整できます ただし論文概要を埋め込む箇所に{summary}を入れてください",
        require: true,
        max_length: 3000
      }
    ]
  },
  {
    name: "setmodel",
    description: "要bot manager：モデルを設定できます",
    options: [
      {
        type: 3,
        name: model_option_name,
        description: "適切なChatGPTのモデル名を入力してください",
        require: true,
        max_length: 3000
      }
    ]
  },
  {
    name: "setmax",
    description: "要bot manager：一日に生成される論文要約の上限を設定できます",
    options: [
      {
        type: 4,
        name: max_option_name,
        description: "上限を正の整数で入力してください",
        require: true,
        min_value: 1,
        max_value: 200
      }
    ]
  },
  {
    name: "channelinit",
    description: "要bot manager：このチャンネルをbotに追加します",
    options: [
      {
        type: 3,
        name: search_option_name,
        description: "追加したい論文検索ワードを半角カンマ(,)区切りで入力してください",
        required: true,
        max_length: 300
      },
      {
        type: 3,
        name: prompt_option_name,
        description: "ChatGPTへ投稿する内容を調整できます ただし論文概要を埋め込む箇所に{summary}を入れてください",
        require: true,
        max_length: 3000
      },
      {
        type: 3,
        name: model_option_name,
        description: "適切なChatGPTのモデル名を入力してください",
        require: true,
        max_length: 3000
      },
      {
        type: 4,
        name: max_option_name,
        description: "上限を正の整数で入力してください",
        require: true,
        min_value: 1,
        max_value: 200
      }
    ]
  },
];

//discord botのクライアント
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
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
//2次元の配列を1次元に展開
const compress_array = <T>(array: T[][]) => {
  let result = new Array<T>();
  for (const chunk of array) {
    result = result.concat(chunk);
  }
  return result;
}

//OpenAIのAPIキーを設定する
const configration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
//APIクライアントを生成
const openai = new OpenAIApi(configration);

//引数の検索ワードでarXivから取得
const getArxivPapers = (async (search_word: string) => {
  //arXivクエリの設定
  const search: ArxivQuery = {
    searchQuery: search_word,
    maxResults: "30",
    sortBy: "submittedDate",
    sortOrder: "descending",
  };
  //arXivに送るURLの生成
  const arxiv_url = generateArxivURL(search);
  //arXivからのレスポンスをjsonに変換して中身を取り出す
  const res_json = jsonMakeArray(JSON.parse(xml2json((await axios.get(arxiv_url)).data as string, { compact: true, spaces: 2 })).feed.entry);

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
        yesterday.setDate(yesterday.getDate() - 10);

        return yesterday < paper.published && paper.published < today;
      });

    return today_papers;
  }

  return [] as ArxivParer[];
});

const getChannelMessage = async (channel_setting: ChannelSetting) => {
  //バグるかも
  let papers = compress_array(await Promise.all(channel_setting.search_words.map(async s_word => {
    return await getArxivPapers(s_word);
  })));

  if (papers.length > channel_setting.max) papers = papers.slice(0, channel_setting.max);

  return await Promise.all(papers.map(async paper => {
    const result = await (async () => {
      try {
        const result = await openai.createChatCompletion({
          model: channel_setting.model,
          messages: [{ role: "user", content: (channel_setting.prompt as string).replace("{summary}", paper.summary) }],
        });

        return {
          paper: paper,
          summary: result.data.choices[0].message?.content.trim(),
        };
      } catch (error) {
        console.error(error);
        return {
          paper: paper,
          summary: `Failed to connect ChatGPT API.\nErrorContext: ${error}`
        }
      }
    })();

    return `**Title:**  ${result.paper.title}\n\n`
      + "**Authors:**  " + result.paper.author.map(au => `${au}`) + "\n\n"
      + `**Summary:** ${result.summary}\n`
      + `${paper.link}\n`;
  }));
}

const getEachChannelMessage = async (channel_setting: ChannelSetting[]) => {
  return (await Promise.all(channel_setting.map(async setting => {
    return {
      channel_id: setting.channel_id,
      message: await getChannelMessage(setting)
    } as ChannelMessage;
  })));
}

client.once(Events.ClientReady, async () => {
  await client.application?.commands.set(command_data);

  console.log('Ready!');
  if (client.user) {
    console.log(client.user.tag);
  }
});

const writeConfigFile = async (config: ChannelSetting[]) => {
  try {
    await fs.writeFileSync(config_path, JSON.stringify(config, null, '\t'), 'utf-8');
  } catch (err) {
    console.log(err);
  }
}

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) {
    return;
  }
  const command = interaction.commandName;
  const config: ChannelSetting[] = JSON.parse(fs.readFileSync(config_path,'utf-8'));
  const index = config.findIndex(setting => setting.channel_id === interaction.channelId);

  if (command === command_data[0].name) {
    //検索ワードを何もないときに合わせて整形するための関数
    const formatSearchWord = (s_words: string[]): string => {
      if (s_words.length === 0) {
        return "論文検索ワードが登録されていません";
      } else {
        return s_words.map(word => `${word}`).join(", ");
      }
    }

    const ch_setting = config.find(ch => ch.channel_id === interaction.channelId);
    if (ch_setting === undefined) {
      interaction.reply("チャンネルIDがBOTに登録されていません。BOTが使用できるチャンネルを間違えていないか確認してください。");
      return;
    } else {
      const message = "登録された論文検索ワード：" + formatSearchWord(ch_setting.search_words) + "\n"
        + `一日の最大論文投稿数：${ch_setting.max}\n`
        + `ChatGPTに投稿する文章のフォーマット\n${ch_setting.prompt}\n`
        + `ChatGPTのモデル：${ch_setting.model}`;
      await interaction.reply(message);
      return;
    }
  }
  else {
    //コマンドをロールで制限するために必要な宣言と処理
    const guild = interaction.guild;
    if (guild === null) {
      await interaction.reply('guildがnullでした bot管理者に問い合わせてください');
      return;
    }
    const user = guild.members.cache.get(interaction.user.id) as GuildMember;
    const roles = user.roles.cache;
    const server_manager = guild.roles.cache.find(role => role.name === server_manager_name);
    if (server_manager === undefined) {
      await interaction.reply(`${server_manager_name}のロールが設定されていません このコマンドはロールを設定してから使用できます`);
      return;
    }
    const bot_manager = guild.roles.cache.find(role => role.name === bot_manager_name);
    if (bot_manager === undefined) {
      await interaction.reply(`${bot_manager_name}のロールが設定されていません このコマンドはロールを設定してから使用できます`);
      return;
    }

    //サーバー管理者が実行できるコマンド
    if (roles.has(server_manager.id)) {
      if (command === command_data[2].name) {
        await interaction.deferReply();
        const words = interaction.options.data[0].value?.toString().split(",");

        if (words === undefined || words.length === 0 || index === -1) {
          interaction.editReply("入力が正常に行われませんでした");
          return;
        } else {
          config[index].search_words = words;
          await writeConfigFile(config);

          interaction.editReply("検索ワードが更新されました");
          return;
        }
      } else if (command === command_data[3].name) {
        await interaction.deferReply();
        const prompt = interaction.options.data[0].value?.toString();

        if (prompt === undefined || index === -1) {
          interaction.editReply("入力が正常に行われませんでした");
          return;
        } else {
          config[index].prompt = prompt;
          await writeConfigFile(config);

          interaction.editReply("プロンプトが更新されました");
          return;
        }
      }
    }

    //bot管理者が実行できるコマンド
    if (roles.has(bot_manager.id)) {
      if (command === command_data[1].name) {
        await interaction.deferReply();
        const ch_setting = config.find(ch => ch.channel_id === interaction.channelId);
        if (ch_setting === undefined) {
          await interaction.editReply("チャンネルIDがbotに登録されていません。必要ならbot管理者に問い合わせてください。");
          return;
        } else {
          const messages = await getChannelMessage(ch_setting);
          await interaction.editReply('今日の新着論文です');
          for(const msg of messages){
            interaction.followUp(msg);
          }
          return;
        }
      }
      else if (command === command_data[4].name) {
        await interaction.deferReply();
        const model = interaction.options.data[0].value?.toString();

        if (model === undefined || model.length === 0 || index === -1) {
          await interaction.editReply("入力が正常に行われませんでした");
          return;
        } else {
          config[index].model = model;
          await writeConfigFile(config);

          await interaction.editReply("ChatGPTのモデルが更新されました");
          return;
        }
      } else if (command === command_data[5].name) {
        await interaction.deferReply();
        const max = interaction.options.data[0].value as number;

        if (max === undefined || max < 1 || index === -1) {
          await interaction.editReply("入力が正常に行われませんでした");
          return;
        } else {
          config[index].max = max;
          await writeConfigFile(config);

          await interaction.editReply("一日の論文要約量の上限が更新されました");
          return;
        }
      } else if (command === command_data[6].name) {
        await interaction.deferReply();
        if (config.find(conf => conf.channel_id === interaction.channelId) !== undefined) {
          await interaction.editReply("このチャンネルは既に登録されています");
          return;
        }

        const words = interaction.options.get(search_option_name)?.value?.toString().split(",");
        if (words === undefined || words.length === 0) {
          await interaction.editReply("入力が正常に行われませんでした");
          return;
        }
        const prompt = interaction.options.get(prompt_option_name)?.value?.toString();
        if (prompt === undefined) {
          await interaction.editReply("入力が正常に行われませんでした");
          return;
        }
        const model = interaction.options.get(model_option_name)?.value?.toString();
        if (model === undefined || model.length === 0) {
          await interaction.editReply("入力が正常に行われませんでした");
          return;
        }
        const max = interaction.options.get(max_option_name)?.value as number;
        if (max === undefined || max < 1) {
          await interaction.editReply("入力が正常に行われませんでした");
          return;
        }

        config.push({
          channel_id: interaction.channelId,
          search_words: words,
          prompt: prompt,
          model: model,
          max: max,
        });
        await writeConfigFile(config);
        await interaction.editReply("このチャンネルが登録されました");
        return;
      }
    }

    interaction.reply("指定されたコマンドは無効です コマンド名が誤っているか，必要な権限がないと思われます");
    return;
  }
});

//毎日17時に投稿するように設定
cron.schedule('0 0 17 * * *', async () => {
  const config: ChannelSetting[] = JSON.parse(fs.readFileSync(config_path,'utf-8'));
  const channel_messages = await getEachChannelMessage(config);

  await Promise.all(channel_messages.map(async c_msg => {
    const channel = client.channels.cache.get(c_msg.channel_id);
    if (channel?.type === ChannelType.GuildText) {
      await Promise.all(c_msg.message.map(async msg => await channel.send(msg)));
    }
  }));
});

client.login(process.env.BOT_TOKEN);
