import {IRect} from "./typeDefinitions";
import * as utils from "./utils";
import {Image, CanvasRenderingContext2D} from 'canvas';

export async function drawTwitchMessage(ctx: CanvasRenderingContext2D, pos: IRect, emoteSize: number, message) {
    message.messageContent = message.messageContent.split('\n').join(' ');

    const words = message.messageContent.split(' ');
    const wordSpacing = ctx.measureText(" ").width;

    let index = 0;
    let line = 0;
    let xPos = pos.x;
    for (let i = 0; i < words.length; i++) {
        const wordsWidth = ctx.measureText(words[i]).width;
        if (xPos + wordsWidth > pos.x + pos.width) {
            line++;
            xPos = pos.x;
        }

        const lineY = pos.y + emoteSize + (emoteSize * 1.1) * line;

        ctx.fillText(words[i], xPos, lineY);

        xPos += wordsWidth + wordSpacing;
        index += words[i].length + 1;
    }
}
