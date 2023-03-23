require('dotenv').config();
const express = require('express');
const app = express();
const runSpawn = require('./runSpawn');
const tgnotice = require('./tgnotice');
const { spawn } = require('child_process');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc).extend(timezone);

const PORT = process.env.PORT;
const BILIFILE = process.env.BILIFILE;
const RCLONEDIR = process.env.RCLONEDIR;

const WROOMID = process.env.WROOMID.split(',').map(Number);
const BROOMID = process.env.BROOMID.split(',').map(Number);
const CROOMID = process.env.CROOMID.split(',').map(Number);

// 队列，用于存储事件
const queue = [];
// 是否有 FFmpeg 进程正在运行
let isFFmpegRunning = false;

//监听端口
var server = app.listen(PORT, function() {

    var host = server.address().address
    var port = server.address().port

    console.log("BiliLiveAuto脚本正在运行, 地址为 http://%s:%s", host, port);
})

app.use(express.json({ extended: false }));

//  POST 请求
app.post('/', function(req, res) {
    //读取body中的数据
    res.sendStatus(200);
    console.log("Webhook: 录播姬 POST 到达 事件：" + req.body.EventType);
    let type = WROOMID.includes(Number(req.body.EventData.RoomId)) ? 'W' : (BROOMID.includes(Number(req.body.EventData.RoomId)) ? 'B' : (CROOMID.includes(Number(req.body.EventData.RoomId)) ? 'C' : 'O'));
    let text = `分区 <code>:</code> ${req.body.EventData.AreaNameParent} ${req.body.EventData.AreaNameChild} <b>${type}</b>\n标题 <code>:</code> <i><a href="https://live.bilibili.com/${req.body.EventData.RoomId}">${req.body.EventData.Title}</a></i>`;
    //判断直播事件：开播、下播、录制、文件关闭等
    switch (req.body.EventType) {
        case "FileClosed":
            const event = {
                eventid: req.body.EventId,
                filepath: req.body.EventData.RelativePath,
                roomid: req.body.EventData.RoomId,
                name: req.body.EventData.Name,
                title: req.body.EventData.Title,
                fileopentime: req.body.EventData.FileOpenTime,
            }
            runbash(event);
            break;
        case "StreamStarted":
            var banner = `<tg-spoiler>~—~—~—</tg-spoiler><b>LIVE-MESSAGE</b><tg-spoiler>—~—~—~</tg-spoiler>\n🟡 <b>${req.body.EventData.Name}</b> <code>>></code> 直播开始！`;
            tgnotice(banner, text);
            break;
        case "SessionStarted":
            var banner = `🟢 <b>${req.body.EventData.Name}</b> <code>>></code> 开始录制！`;
            tgnotice(banner, '');
            break;
        case "StreamEnded":
            var banner = `🔴 <b>${req.body.EventData.Name}</b> <code>>></code> 直播结束！`;
            tgnotice(banner, '');
            break;
        default:
            console.log("Webhook: 判断类型: " + req.body.EventType + " => 提醒未发送");
    };
})

//处理事件
function runbash(event) {
    // 检查当前是否有 FFmpeg 进程正在运行
    if (isFFmpegRunning && CROOMID.includes(Number(event.roomid))) {
        // 如果有，将事件添加到队列中
        addBashToQueue(event);
    } else {
        // 如果没有，立即处理事件
        handleBash(event);
    }
}

// 添加事件到队列中
function addBashToQueue(event) {
    queue.push(event);
    console.log(queue)
}

// 处理事件函数
function handleBash(event) {
    if (CROOMID.includes(Number(event.roomid))) {
        // 标记 FFmpeg 进程正在运行
        isFFmpegRunning = true;
    }
    const roomid = event.roomid;
    const partialPath = dayjs(event.fileopentime).tz('Asia/Shanghai').format('YYYY_MM');
    event["filepath"] = event.filepath.slice(0, -4);
    event["timeid"] = dayjs(event.fileopentime).tz('Asia/Shanghai').format('YYYYMMDD_HHmmssSSS');
    event["afterRclone"] = `${RCLONEDIR}${roomid}-${event.name}/${partialPath}/${event.timeid}`;
    event["afterdir"] = `${BILIFILE}/${roomid}-${event.name}/${event.timeid}`;

    runSpawn(event).then(() => {

        const ls = spawn('rclone', ['ls', `${event.afterRclone}/`, '--exclude', '*.txt'], { stdio: ['ignore', 'pipe', 'pipe'] });
        const wc = spawn('wc', ['-l'], { stdio: ['pipe', 'pipe', 'ignore'] });
        ls.stdout.pipe(wc.stdin);

        wc.stdout.on('data', (data) => {
            //console.log('data received:', data);
            const stdout = data.toString().trim();
            //console.log(Number(stdout));

            let a = WROOMID.includes(Number(roomid)) ? 5 : (BROOMID.includes(Number(roomid)) ? 2 : 3)
                //console.log(`a=${a}`)
            if (a === Number(stdout)) {
                tgnotice(`🎊 <b>${event.name}</b> <code>>></code> 上传成功！`, '');
                spawn('rm', ['-rf', `${event.afterdir}`]).on('close', code => console.log(`[    rm-exit  ] (${event.eventid}): ${code}`))
            } else {
                tgnotice(`🚧 <b>${event.name}</b> <code>>></code> <b><i><u>上传失败！</u></i></b>`, '');
            };
        });

        wc.on('close', code => {
            console.log(`[    wc-exit  ] (${event.eventid}): ${code}`)
            if (CROOMID.includes(Number(event.roomid))) {
                if (queue.length > 0) {
                    console.log("处理下一事件")
                    const nextBash = queue.shift();
                    console.log(nextBash)
                    handleBash(nextBash);
                } else {
                    isFFmpegRunning = false;
                }
            }

        })
    })
}