"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const xml_js_1 = require("xml-js");
const arxiv_url_1 = require("./arxiv-url");
//.envファイルを読み込む
dotenv_1.default.config();
const search = {
    searchQuery: "quant-ph",
    maxResults: "1"
};
console.log((0, arxiv_url_1.generateArxivURL)(search));
(() => __awaiter(void 0, void 0, void 0, function* () {
    const arxiv_url = (0, arxiv_url_1.generateArxivURL)(search);
}))();
axios_1.default.get((0, arxiv_url_1.generateArxivURL)(search))
    .then((response) => {
    console.log((0, xml_js_1.xml2json)(response.data, { compact: true, spaces: 2 }));
});
/*
//DiscordBotで使うGetwayIntents、partials
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

//OpenAIのAPIキーを設定する
const configration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
//APIクライアントを生成
const openai = new OpenAIApi(configration);

//DiscordBotがきちんと起動したか確認
client.once('ready', () => {
  console.log('Ready!')
  if (client.user) {
    console.log(client.user.tag)
  }
});

//!timeと入力すると現在時刻を返信するように
client.on(Events.ClientReady, async () => {
  const chat = [
    {
      name: "gpt",
      description: "質問したら答えが返ってきます",
      options: [
        {
          type: 3,
          name: "質問",
          description: "質問したい文を入れてください",
          required: true,
        },
      ],
    },
  ];
  
  await client.application?.commands.set(chat);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if(!interaction.isCommand()) return;

  const command = interaction.commandName;
  if(command === "gpt") {
    const question = interaction.options.get("質問")?.value as string;
    console.log(question);

    //interactionの返信を遅延する
    await interaction.deferReply();

    (async () => {
      try{
        const completion = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [{role: "user", content: `${question}`}],
        });
        await interaction.editReply(
          `${question}\n>>${completion.data.choices[0].message?.content.trim()}\r\n`
        );
      }catch(error){
        console.error(error);
        await interaction.editReply(`エラーが発生しました：${error}`);
      }
    })();
  }
});

//ボット作成時のトークンでDiscordと接続
client.login(process.env.BOT_TOKEN);
*/ 
