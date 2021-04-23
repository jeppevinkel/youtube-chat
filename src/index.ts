import * as WebSocket from 'ws';
import * as avatar from './modules/avatar';
import * as utils from './modules/utils';
import {createCanvas, Image, loadImage, PNGStream} from "canvas";
import {drawTwitchMessage} from "./modules/emoteCanvas";
import {ICustomNotification, IRect} from "./modules/typeDefinitions";
import fetch, {
    Blob,
    Headers,
    Request,
    RequestInit,
    Response,
    FetchError
} from "node-fetch";
import {URL} from "url";
import {drawRoundedImage} from "./modules/utils";
const privateMessageConfig = require('../notifications/privateMessage.json');
const config = require("../config.json");
const secrets = require("../secrets.json");
import * as moment from 'moment';

let botList: String[] = [
    "nightbot",
    "cloudbot"
];

let _websocket;
let _clearCacheInterval;
let active: Boolean = false;
let nextPageToken = "";
let initialized: Boolean = false;
let channelTitle: String|null = null;
let _messages = [];

let discordInterval: NodeJS.Timeout;

connectLoop();

if (config.discord_integration.enabled) {
    discordInterval = setInterval(sendLog, config.discord_integration.log_interval);
}

function sendLog() {
    if (!_messages.length) return;
    let content = _messages.join('\n');

    fetch(config.discord_integration.webhook, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({"content": content})
    }).catch(r => console.log(r));

    _messages = [];
}

function connectLoop()
{
    if(!active) {
        if (typeof _websocket !== 'undefined') _websocket.close();
        _websocket = new WebSocket(`${config.open_vr_notification_pipe.host}:${config.open_vr_notification_pipe.port}`);
        _websocket.onopen = function (evt) {
            onOpen(evt)
        };
        _websocket.onclose = function (evt) {
            onClose(evt)
        };
        _websocket.onerror = function (evt) {
            onError(evt)
        };
    }
    setTimeout(connectLoop, 5000);
}

function onOpen(evt)
{
    active = true;
    console.log("[PIPE] Started clearCacheInterval");
    _clearCacheInterval = setInterval(avatar.clearCache, 60 * 60 * 1000);
}

function onClose(evt)
{
    active = false;
    console.log("[PIPE] Stopped clearCacheInterval");
    clearInterval(_clearCacheInterval);
    avatar.clearCache();
}

function onError(evt) {
    console.log("[PIPE] ERROR: "+JSON.stringify(evt, null, 2));
}

const headers = new Headers();
headers.append("Content-Type", "application/json");

let videoIdUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
videoIdUrl.searchParams.append("key", secrets.api_key);
videoIdUrl.searchParams.append("id", config.video_id);
videoIdUrl.searchParams.append("part", "liveStreamingDetails,snippet")

let liveMessageUrl = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
liveMessageUrl.searchParams.append("key", secrets.api_key);
liveMessageUrl.searchParams.append("part", "snippet,authorDetails");
liveMessageUrl.searchParams.append("pageToken", nextPageToken);

const requestOptions: RequestInit = {
    headers,
    method: "GET",
    timeout: 5000,

};
fetch(videoIdUrl, requestOptions).then(response => {
    response.json().then(json => {
        let details = json.items[0];
        if (details) {
            liveMessageUrl.searchParams.append("liveChatId", details.liveStreamingDetails.activeLiveChatId);
            channelTitle = details.snippet.channelTitle;
            setInterval(getNewChat, 5000);
        }
    })
});

async function getNewChat() {
    fetch(liveMessageUrl, requestOptions).then(response => {
        response.json().then(json => {
            if (json.nextPageToken) liveMessageUrl.searchParams.set("pageToken", json.nextPageToken);
            if (!initialized) {
                initialized = true;
                return;
            }
            if(json.items) {
                for (const item of json.items) {
                    if (botList.includes(item.authorDetails.displayName.toLowerCase())) continue;
                    let message = {
                        displayName: item.authorDetails.displayName,
                        messageContent: item.snippet.displayMessage,
                        username: item.authorDetails.displayName,
                        publishedAt: item.snippet.publishedAt,
                        tags: {
                            color: "#de4646",
                            displayName: item.authorDetails.displayName,
                            channelId: item.authorDetails.channelId,
                            isModerator: item.authorDetails.isChatModerator,
                            isStreamer: item.authorDetails.isChatOwner,
                            isSponsor: item.authorDetails.isChatSponsor
                        }
                    };

                    pushMessage(message, item.authorDetails.profileImageUrl);
                    pushDiscordMessage(message);
                    console.log(item.authorDetails.displayName + ": " + item.snippet.displayMessage);
                }
            }
        })
    })
}

async function pushMessage(message, profileImageUrl: string = undefined) {
    let msgValues: ICustomNotification = privateMessageConfig.style;
    msgValues.custom = true;

    if (message.messageContent[0] == "!") return;

    const bg = await loadImage(privateMessageConfig.message.background);
    const canvas = createCanvas(bg.width, bg.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bg, 0, 0);
    ctx.fillStyle = privateMessageConfig.message.fill_style;
    ctx.font = privateMessageConfig.message.font;

    avatar.generate(message.tags.displayName, message.tags.color, message.username).then(data => {
        utils.loadImage(profileImageUrl, `${message.tags.channelId}.png`, "avatar", data).then(img => {
            drawTwitchMessage(ctx, privateMessageConfig.message.message_box as IRect, privateMessageConfig.message.emote_size, message).then( () => {

                new Promise<Image>(async (resolve, reject) => {
                    const _img = new Image();
                    _img.onload = () => resolve(_img);
                    _img.onerror = reject;
                    _img.src = new Buffer(img, 'base64');
                }).then(im => {
                    if (privateMessageConfig.message.avatar.rounded) {
                        drawRoundedImage(ctx,
                            im,
                            privateMessageConfig.message.avatar.x,
                            privateMessageConfig.message.avatar.y,
                            privateMessageConfig.message.avatar.width,
                            privateMessageConfig.message.avatar.height);
                    }
                    else {
                        ctx.drawImage(im,
                            privateMessageConfig.message.avatar.x - (privateMessageConfig.message.avatar.width/2),
                            privateMessageConfig.message.avatar.y - (privateMessageConfig.message.avatar.height/2),
                            privateMessageConfig.message.avatar.width,
                            privateMessageConfig.message.avatar.height);
                    }

                    ctx.save();
                    ctx.fillStyle = privateMessageConfig.message.name_display.fill_style;
                    ctx.font = privateMessageConfig.message.name_display.font;
                    let channelText = ` [#${channelTitle}]`;
                    ctx.fillText(message.displayName+channelText, privateMessageConfig.message.name_display.x, privateMessageConfig.message.name_display.y);
                    ctx.restore();

                    msgValues.image = canvas.toDataURL().split(',')[1];

                    _websocket.send(JSON.stringify(msgValues));
                });


            });
        });
    }).catch(() => {
        drawTwitchMessage(ctx, privateMessageConfig.message.message_box as IRect, privateMessageConfig.message.emote_size, message).then( () => {

            msgValues.image = canvas.toDataURL().split(',')[1];

            _websocket.send(JSON.stringify(msgValues));
        });
    });
}

function pushDiscordMessage(message) {
    let dt = moment(message.tags.publishedAt);
    let meta = `[#${channelTitle}][${dt.format('HH:mm')}]`;

    // Checks
    let isBroadcaster = message.tags.isStreamer;
    let isSub = (isBroadcaster || message.tags.isSponsor);

    // Badges
    let subBadge = isSub ? `[💸]`:'';
    let modBadge = message.tags.isModerator ? '[🛡️]':'';
    let broadcasterBadge = isBroadcaster ? '[📣]':'';

    // Name
    let displayName = message.displayName;
    if(isBroadcaster) displayName = `**${displayName}**`; // Bold broadcaster

    let combined = `${meta} ${subBadge}${modBadge}${broadcasterBadge} ${displayName}: ${message.messageContent}`;

    _messages.push(combined);
}
