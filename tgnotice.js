const dotenv = require("dotenv")
dotenv.config()
const TelegramBot = require('node-telegram-bot-api');

const TG_TOKEN = process.env.TG_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS;
const TG_TIMEOUTDELETE = process.env.TG_TIMEOUTDELETE;

const bot = new TelegramBot(TG_TOKEN, {
  polling: false
})

function tgnotice(banner, text) {

  const chatIds = CHAT_IDS.split(',');

  chatIds.forEach((chatId) => {
    bot.sendMessage(chatId, `${banner}\n${text}`, { parse_mode: "HTML", disable_web_page_preview: true })
      .then(message => {
        console.log(`Message sent: ${message.text}\n`);
        deleteMessage(message, TG_TIMEOUTDELETE);
      })
      .catch((error) => {
        console.error('TG_Error:', error);
      })
  });

}

/**
 * 延迟删除消息
 * @param msg 需要删除的消息
 * @param times 延迟 单位:s
 */
const deleteMessage = (msg, times) => {
  return setTimeout(async () => {
    try {
      await bot.deleteMessage(msg.chat.id, `${msg.message_id}`)
    } catch (error) {
      console.log(error.message);
    }
  }, times * 1000)
}


module.exports = tgnotice;
