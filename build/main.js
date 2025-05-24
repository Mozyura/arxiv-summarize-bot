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
//必要なパッケージをインポートする
const discord_js_1 = require("discord.js");
const openai_1 = require("openai");
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const xml_js_1 = require("xml-js");
const arxiv_1 = require("./arxiv");
const node_cron_1 = __importDefault(require("node-cron"));
const fs_1 = __importDefault(require("fs"));
//.envファイルを読み込む
dotenv_1.default.config();
//////////////定数の宣言/////////////////
const config_path = './config.json';
const search_option_name = "論文検索ワード";
const prompt_option_name = "プロンプト設定";
const model_option_name = "言語モデル指定";
const max_option_name = "一回で生成される論文数の上限";
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
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
    ],
    partials: [discord_js_1.Partials.Message, discord_js_1.Partials.Channel],
});
//読み込んだjsonがオブジェクト型の時と配列型の時で処理を分岐させる
const jsonMakeArray = (instance) => {
    if (instance instanceof Array) {
        return instance;
    }
    else {
        return new Array(instance);
    }
};
//2次元の配列を1次元に展開
const compress_array = (array) => {
    let result = new Array();
    for (const chunk of array) {
        result = result.concat(chunk);
    }
    return result;
};
//OpenAIのAPIキーを設定する
const configration = new openai_1.Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
//APIクライアントを生成
const openai = new openai_1.OpenAIApi(configration);
//引数の検索ワードでarXivから取得
const getArxivPapers = ((search_word) => __awaiter(void 0, void 0, void 0, function* () {
    //arXivクエリの設定
    const search = {
        searchQuery: search_word,
        maxResults: "30",
        sortBy: "submittedDate",
        sortOrder: "descending",
    };
    //arXivに送るURLの生成
    const arxiv_url = (0, arxiv_1.generateArxivURL)(search);
    //arXivからのレスポンスをjsonに変換して中身を取り出す
    const res_json = jsonMakeArray(JSON.parse((0, xml_js_1.xml2json)((yield axios_1.default.get(arxiv_url)).data, { compact: true, spaces: 2 })).feed.entry);
    if (res_json.length > 0) {
        //今日確認できる出版論文を確認する
        const today_papers = res_json.map(paper => {
            //著者名は複数にわたるので、文字列の配列として取り出す
            //ただし単著の際はObjectとして取り出されるようなので，処理を分岐
            const _author = jsonMakeArray(paper.author)
                .map(author => author.name._text);
            //出版日を日付で取り出す（そのまま取り出すとタイムゾーンやらで難しい）
            const _published = new Date(paper.published._text.split('T')[0]);
            //ArxivParer型のデータ構造に整形
            return {
                title: paper.title._text,
                link: paper.id._text,
                author: _author,
                summary: paper.summary._text,
                published: _published
            };
        })
            //昨日出版された論文のみにフィルタリング
            .filter(paper => {
            //今日の日付情報
            const today = new Date();
            today.setDate(today.getDate());
            //昨日の日付情報
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 10);
            return yesterday < paper.published && paper.published < today;
        });
        return today_papers;
    }
    return [];
}));
const getChannelMessage = (channel_setting) => __awaiter(void 0, void 0, void 0, function* () {
    //バグるかも
    let papers = compress_array(yield Promise.all(channel_setting.search_words.map((s_word) => __awaiter(void 0, void 0, void 0, function* () {
        return yield getArxivPapers(s_word);
    }))));
    if (papers.length > channel_setting.max)
        papers = papers.slice(0, channel_setting.max);
    return yield Promise.all(papers.map((paper) => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield (() => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            try {
                const result = yield openai.createChatCompletion({
                    model: channel_setting.model,
                    messages: [{ role: "user", content: channel_setting.prompt.replace("{summary}", paper.summary) }],
                });
                return {
                    paper: paper,
                    summary: (_a = result.data.choices[0].message) === null || _a === void 0 ? void 0 : _a.content.trim(),
                };
            }
            catch (error) {
                console.error(error);
                return {
                    paper: paper,
                    summary: `Failed to connect ChatGPT API.\nErrorContext: ${error}`
                };
            }
        }))();
        return `**Title:**  ${result.paper.title}\n\n`
            + "**Authors:**  " + result.paper.author.map(au => `${au}`) + "\n\n"
            + `**Summary:** ${result.summary}\n`
            + `${paper.link}\n`;
    })));
});
const getEachChannelMessage = (channel_setting) => __awaiter(void 0, void 0, void 0, function* () {
    return (yield Promise.all(channel_setting.map((setting) => __awaiter(void 0, void 0, void 0, function* () {
        return {
            channel_id: setting.channel_id,
            message: yield getChannelMessage(setting)
        };
    }))));
});
client.once(discord_js_1.Events.ClientReady, () => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    yield ((_b = client.application) === null || _b === void 0 ? void 0 : _b.commands.set(command_data));
    console.log('Ready!');
    if (client.user) {
        console.log(client.user.tag);
    }
}));
const writeConfigFile = (config) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield fs_1.default.writeFileSync(config_path, JSON.stringify(config, null, '\t'), 'utf-8');
    }
    catch (err) {
        console.log(err);
    }
});
client.on(discord_js_1.Events.InteractionCreate, (interaction) => __awaiter(void 0, void 0, void 0, function* () {
    var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    if (!interaction.isCommand()) {
        return;
    }
    const command = interaction.commandName;
    const config = JSON.parse(fs_1.default.readFileSync(config_path, 'utf-8'));
    const index = config.findIndex(setting => setting.channel_id === interaction.channelId);
    if (command === command_data[0].name) {
        //検索ワードを何もないときに合わせて整形するための関数
        const formatSearchWord = (s_words) => {
            if (s_words.length === 0) {
                return "論文検索ワードが登録されていません";
            }
            else {
                return s_words.map(word => `${word}`).join(", ");
            }
        };
        const ch_setting = config.find(ch => ch.channel_id === interaction.channelId);
        if (ch_setting === undefined) {
            interaction.reply("チャンネルIDがBOTに登録されていません。BOTが使用できるチャンネルを間違えていないか確認してください。");
            return;
        }
        else {
            const message = "登録された論文検索ワード：" + formatSearchWord(ch_setting.search_words) + "\n"
                + `一日の最大論文投稿数：${ch_setting.max}\n`
                + `ChatGPTに投稿する文章のフォーマット\n${ch_setting.prompt}\n`
                + `ChatGPTのモデル：${ch_setting.model}`;
            yield interaction.reply(message);
            return;
        }
    }
    else {
        //コマンドをロールで制限するために必要な宣言と処理
        const guild = interaction.guild;
        if (guild === null) {
            yield interaction.reply('guildがnullでした bot管理者に問い合わせてください');
            return;
        }
        const user = guild.members.cache.get(interaction.user.id);
        const roles = user.roles.cache;
        const server_manager = guild.roles.cache.find(role => role.name === server_manager_name);
        if (server_manager === undefined) {
            yield interaction.reply(`${server_manager_name}のロールが設定されていません このコマンドはロールを設定してから使用できます`);
            return;
        }
        const bot_manager = guild.roles.cache.find(role => role.name === bot_manager_name);
        if (bot_manager === undefined) {
            yield interaction.reply(`${bot_manager_name}のロールが設定されていません このコマンドはロールを設定してから使用できます`);
            return;
        }
        //サーバー管理者が実行できるコマンド
        if (roles.has(server_manager.id)) {
            if (command === command_data[2].name) {
                yield interaction.deferReply();
                const words = (_c = interaction.options.data[0].value) === null || _c === void 0 ? void 0 : _c.toString().split(",");
                if (words === undefined || words.length === 0 || index === -1) {
                    interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                else {
                    config[index].search_words = words;
                    yield writeConfigFile(config);
                    interaction.editReply("検索ワードが更新されました");
                    return;
                }
            }
            else if (command === command_data[3].name) {
                yield interaction.deferReply();
                const prompt = (_d = interaction.options.data[0].value) === null || _d === void 0 ? void 0 : _d.toString();
                if (prompt === undefined || index === -1) {
                    interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                else {
                    config[index].prompt = prompt;
                    yield writeConfigFile(config);
                    interaction.editReply("プロンプトが更新されました");
                    return;
                }
            }
        }
        //bot管理者が実行できるコマンド
        if (roles.has(bot_manager.id)) {
            if (command === command_data[1].name) {
                yield interaction.deferReply();
                const ch_setting = config.find(ch => ch.channel_id === interaction.channelId);
                if (ch_setting === undefined) {
                    yield interaction.editReply("チャンネルIDがbotに登録されていません。必要ならbot管理者に問い合わせてください。");
                    return;
                }
                else {
                    const messages = yield getChannelMessage(ch_setting);
                    yield interaction.editReply('今日の新着論文です');
                    for (const msg of messages) {
                        interaction.followUp(msg);
                    }
                    return;
                }
            }
            else if (command === command_data[4].name) {
                yield interaction.deferReply();
                const model = (_e = interaction.options.data[0].value) === null || _e === void 0 ? void 0 : _e.toString();
                if (model === undefined || model.length === 0 || index === -1) {
                    yield interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                else {
                    config[index].model = model;
                    yield writeConfigFile(config);
                    yield interaction.editReply("ChatGPTのモデルが更新されました");
                    return;
                }
            }
            else if (command === command_data[5].name) {
                yield interaction.deferReply();
                const max = interaction.options.data[0].value;
                if (max === undefined || max < 1 || index === -1) {
                    yield interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                else {
                    config[index].max = max;
                    yield writeConfigFile(config);
                    yield interaction.editReply("一日の論文要約量の上限が更新されました");
                    return;
                }
            }
            else if (command === command_data[6].name) {
                yield interaction.deferReply();
                if (config.find(conf => conf.channel_id === interaction.channelId) !== undefined) {
                    yield interaction.editReply("このチャンネルは既に登録されています");
                    return;
                }
                const words = (_g = (_f = interaction.options.get(search_option_name)) === null || _f === void 0 ? void 0 : _f.value) === null || _g === void 0 ? void 0 : _g.toString().split(",");
                if (words === undefined || words.length === 0) {
                    yield interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                const prompt = (_j = (_h = interaction.options.get(prompt_option_name)) === null || _h === void 0 ? void 0 : _h.value) === null || _j === void 0 ? void 0 : _j.toString();
                if (prompt === undefined) {
                    yield interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                const model = (_l = (_k = interaction.options.get(model_option_name)) === null || _k === void 0 ? void 0 : _k.value) === null || _l === void 0 ? void 0 : _l.toString();
                if (model === undefined || model.length === 0) {
                    yield interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                const max = (_m = interaction.options.get(max_option_name)) === null || _m === void 0 ? void 0 : _m.value;
                if (max === undefined || max < 1) {
                    yield interaction.editReply("入力が正常に行われませんでした");
                    return;
                }
                config.push({
                    channel_id: interaction.channelId,
                    search_words: words,
                    prompt: prompt,
                    model: model,
                    max: max,
                });
                yield writeConfigFile(config);
                yield interaction.editReply("このチャンネルが登録されました");
                return;
            }
        }
        interaction.reply("指定されたコマンドは無効です コマンド名が誤っているか，必要な権限がないと思われます");
        return;
    }
}));
//毎日17時に投稿するように設定
node_cron_1.default.schedule('0 0 17 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    const config = JSON.parse(fs_1.default.readFileSync(config_path, 'utf-8'));
    const channel_messages = yield getEachChannelMessage(config);
    yield Promise.all(channel_messages.map((c_msg) => __awaiter(void 0, void 0, void 0, function* () {
        const channel = client.channels.cache.get(c_msg.channel_id);
        if ((channel === null || channel === void 0 ? void 0 : channel.type) === discord_js_1.ChannelType.GuildText) {
            yield Promise.all(c_msg.message.map((msg) => __awaiter(void 0, void 0, void 0, function* () { return yield channel.send(msg); })));
        }
    })));
}));
client.login(process.env.BOT_TOKEN);
