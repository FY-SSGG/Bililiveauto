const dotenv = require("dotenv");
dotenv.config();
const { spawn } = require("child_process");
const fs = require('fs');
const { log } = require("console");

const BILIFILE = process.env.BILIFILE;
const DANMUFC = process.env.DANMUFC;
const FFmpegLEVEL = process.env.FFmpegLEVEL;

async function runSpawn(event) {

  const roomid = event.roomid;
  const EventId = event.eventid;
  const text = `${event.timeid}_${sanitizeFilename(event.title)}`;
  const beforePath = `${BILIFILE}/${event.filepath}`;
  const afterRclone = event.afterRclone;
  const afterdir = event.afterdir;
  const type = event.type;
  console.log(`[   runSpawn  ] (${event.name}): ${type}`);

  return new Promise((resolve, reject) => {
    CreateFiles()
      .then(() => MoveFiles())
      .then(() => FFmpeg())
      .then(() => Rclone())
      .then(()=> resolve())
      .catch((error) => {
        reject(error);
      });
  });

  function CreateFiles() {
    return new Promise((resolve, reject) => {
      let finishedProcessesCount = 0;

      const mkdir = spawn("mkdir", [`${afterdir}`]);
      const touchTxt = spawn("touch", [`${beforePath}.txt`]);
      const touchJpg = spawn("touch", [`${beforePath}.cover.jpg`]);
      const touchPng = spawn("touch", [`${beforePath}.cover.png`]);

      const handleProcessClose = () => {
        finishedProcessesCount++;
        if (finishedProcessesCount === 4) {
          console.log(
            `[ Touch-exit  ] (${EventId}): ${
              finishedProcessesCount === 4 ? 0 : 1
            }`
          );
          resolve();
        }
      };

      mkdir.on("close", handleProcessClose);
      touchTxt.on("close", handleProcessClose);
      touchJpg.on("close", handleProcessClose);
      touchPng.on("close", handleProcessClose);
      mkdir.on("error", reject);
      touchTxt.on("error", reject);
      touchJpg.on("error", reject);
      touchPng.on("error", reject);
    });
  }

  function MoveFiles() {
    return new Promise((resolve, reject) => {
      let finishedProcessesCount = 0;

      const mvFlv = spawn("mv", [`${beforePath}.flv`, `${afterdir}/${text}.flv`]);
      const mvTxt = spawn("mv", [`${beforePath}.txt`, `${afterdir}/${text}.txt`]);
      const mvJpg = spawn("mv", [`${beforePath}.cover.jpg`, `${afterdir}/${text}.cover.jpg`]);
      const mvPng = spawn("mv", [`${beforePath}.cover.png`, `${afterdir}/${text}.cover.png`]);
      const mvXml = spawn("mv", [`${beforePath}.xml`, `${afterdir}/${text}.xml`]);

      const handleProcessClose = () => {
        finishedProcessesCount++;
        if (finishedProcessesCount === 5) {
          console.log(`[ Mvall-exit  ] (${EventId}): ${finishedProcessesCount === 5 ? 0 : 1}`);
          resolve();
        }
      };

      mvFlv.on("close", handleProcessClose);
      mvTxt.on("close", handleProcessClose);
      mvJpg.on("close", handleProcessClose);
      mvPng.on("close", handleProcessClose);
      mvXml.on("close", handleProcessClose);
      mvFlv.on("error", reject);
      mvTxt.on("error", reject);
      mvJpg.on("error", reject);
      mvPng.on("error", reject);
      mvXml.on("error", reject);
    });
  }

  function FFmpeg() {
    return new Promise((resolve, reject) => {
      let finishedProcessesCount = 0;

      //弹幕处理有BUG,xml没有弹幕的时候会卡住，无法结束进程
      const danmucl = spawn(DANMUFC, ["-o", "ass", `${afterdir}/${text}.ass`, "-i", "xml", `${afterdir}/${text}.xml`, "--ignore-warnings"]);
      const FFmpeg = spawn("ffmpeg", ["-v", "24", "-i", `${afterdir}/${text}.flv`, "-vn", "-acodec", "libmp3lame", "-q:a", "0", `${afterdir}/${text}.mp3`]);
      setupTimeout(danmucl, `(${EventId}) danmucl`, 1000 * 60 * 2); // 2分钟超时
      danmucl.stderr.on("data", (data) => console.log(`[ danmu-stderr] (${EventId}): ${data}`));
      FFmpeg.stderr.on("data", (data) => console.log(`[FFmpeg-stderr] (${EventId}): ${data}`));

      let nfoContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
    <title>${escapeXml(event.title)}</title>
    <plot>/</plot>
    <year>${event.fileopentime.slice(0, 4)}</year>
    <mpaa>PG</mpaa>
    <genre>Live</genre>
    <genre>zh</genre>
    <director>${escapeXml(event.name)}</director>
    <writer>${escapeXml(event.name)}</writer>
    <actor>
        <name>${escapeXml(event.name)}</name>
        <type>Actor</type>
        <thumb>/</thumb>
    </actor>
    <cover>/</cover>
    <website>https://live.bilibili.com/${event.roomid}</website>
</movie>`;

      const handleProcessClose = () => {
        finishedProcessesCount++;
        if (finishedProcessesCount === 2) {
          console.log(`[FFmpeg-exit  ] (${EventId}): ${finishedProcessesCount === 2 ? 0 : 1}`);
          fs.writeFile(`${afterdir}/${text}.nfo`, nfoContent, (err) => {
            if (err) {
              console.log(`[   Nfo-exit  ] (${EventId}): 1`);
              reject(err);
            }else {
              console.log(`[   Nfo-exit  ] (${EventId}): 0`);
              const rclone = spawn("rclone", ["copy", `${afterdir}/`, `${afterRclone}/`, "--include", "*.nfo", "-q"]);
              rclone.on("close", () => resolve());
              rclone.on("error", reject);
            }
          });
        } 
      };

      /* danmucl.on('close',code=> console.log(`[danmucl-exit ] (${EventId}): ${code}`))
      FFmpeg.on('close',code=> {
        console.log(`[FFmpeg-exit  ] (${EventId}): ${code}`)
        resolve();
      }) */
      danmucl.on("close", (code, signal) => {
        console.log(`[danmucl-exit ] (${EventId}): ${signal || code}`);
        handleProcessClose();
      });
      FFmpeg.on("close", handleProcessClose);
      danmucl.on("error", reject);
      FFmpeg.on("error", (error) => {
        console.log(`[FFmpeg-error ] (${EventId}): ${error}`);
        reject(error);
      });
    });
  }

  function Rclone() {
    return new Promise((resolve, reject) => {
          switch (type) {
            case "W"://Whitelist
              const rcloneW = spawn("rclone", ["copy", `${afterdir}/`, `${afterRclone}/`, "--min-size", "1b", "--onedrive-chunk-size", "25600k", "--transfers", "5", "-q"]);
              rcloneW.stdout.on("data", (data) => console.log(`[rclone-stdout] (${EventId}): ${data}`));
              rcloneW.stderr.on("data", (data) => console.log(`[rclone-stderr] (${EventId}): ${data}`));
              rcloneW.on("close", (code) => {
                console.log(`[rclone-exit  ] (${EventId}): ${code}`);
                resolve();
              });
              rcloneW.on("error", (error) =>{
                console.log(`[rclone-error ] (${EventId}): ${error}`);
                reject()
              });
              break;
            case "B"://Blacklist
              const rcloneB = spawn("rclone", ["copy", `${afterdir}/`, `${afterRclone}/`, "--include", "*.mp3", "--include", "*.ass", "-q"]);
              rcloneB.stdout.on("data", (data) => console.log(`[rclone-stdout] (${EventId}): ${data}`));
              rcloneB.stderr.on("data", (data) => console.log(`[rclone-stderr] (${EventId}): ${data}`));
              rcloneB.on("close", (code) => {
                console.log(`[rclone-exit  ] (${EventId}): ${code}`);
                resolve();
              });
              rcloneB.on("error", (error) =>{
                console.log(`[rclone-error ] (${EventId}): ${error}`);
                reject()
              });
              break;
            case "C"://Code
              console.log(`[  CODE-stdout] (${EventId}): 开始转码`);

              const ffmpeg = spawn("ffmpeg", ["-v", "16", "-threads", "2", "-i", `${afterdir}/${text}.flv`, "-c:v", "libx264", "-crf", "22", "-preset", FFmpegLEVEL, "-c:a", "copy", `${afterdir}/${text}.mp4`]);
              ffmpeg.stdout.on("data", (data) => console.log(`[ffmpeg-stdout] (${EventId}): ${data}`));
              ffmpeg.stderr.on("data", (data) => console.log(`[ffmpeg-stderr] (${EventId}): ${data}`));
              ffmpeg.on("close", (code) => {
                console.log(`[ffmpeg-exit  ] (${EventId}): ${code}`);

                const rclone = spawn("rclone", ["copy", `${afterdir}/`, `${afterRclone}/`, "--min-size", "1b", "--exclude", "*.flv", "--exclude", "*.xml", "--exclude", "*.mp3", "-q"]);
                rclone.stdout.on("data", (data) => console.log(`[rclone-stdout] (${EventId}): ${data}`));
                rclone.stderr.on("data", (data) => console.log(`[rclone-stderr] (${EventId}): ${data}`));
                rclone.on("close", (code) => {
                  console.log(`[rclone-exit  ] (${EventId}): ${code}`);
                  resolve();
                });
                rclone.on("error", (error) =>{
                  console.log(`[rclone-error ] (${EventId}): ${error}`);
                  reject()
                });
              });

              ffmpeg.on("error", (error) => {
                console.log(`[ffmpeg-error ] (${EventId}): ${error}`)
                reject()
              });
              break;
            default:
              const rclone = spawn("rclone", ["copy", `${afterdir}/`, `${afterRclone}/`, "--min-size", "1b", "--exclude", "*.xml", "-q"]);
              rclone.stdout.on("data", (data) => console.log(`[rclone-stdout] (${EventId}): ${data}`));
              rclone.stderr.on("data", (data) => console.log(`[rclone-stderr] (${EventId}): ${data}`));
              rclone.on("close", (code) => {
                console.log(`[rclone-exit  ] (${EventId}): ${code}`);
                resolve();
              });
              rclone.on("error", (error) => {
                console.log(`[rclone-error ] (${EventId}): ${error}`);
                reject()
              });
              break;
          }
    });
  }
}

//超时控制
function setupTimeout(proc, name, timeoutMs) {
  const timer = setTimeout(() => {
    console.log(`[Timeout      ] ${name}: 超时，终止进程`);
    proc.kill("SIGKILL");
  }, timeoutMs);
  proc.on("close", () => clearTimeout(timer));
}

//xml格式化函数
function escapeXml(unsafe) {

  return unsafe.replace(/[<>&'"]/g, function(c) {
      switch (c) {
          case '<':
              return '&lt;';
          case '>':
              return '&gt;';
          case '&':
              return '&amp;';
          case '\'':
              return '&apos;';
          case '"':
              return '&quot;';
      }
  });
}

//路径格式化
function sanitizeFilename(filename) {
  return filename.replace(/[/\\?%*:|"<>]/g, '_');
}

module.exports = runSpawn;
