const dotenv = require("dotenv")
dotenv.config()
const { spawn } = require('child_process');

const BILIFILE = process.env.BILIFILE;
const DANMUFC = process.env.DANMUFC;
const RCLONEDIR = process.env.RCLONEDIR;
const FFmpegLEVEL = process.env.FFmpegLEVEL;

const WROOMID = process.env.WROOMID.split(',').map(Number);
const BROOMID = process.env.BROOMID.split(',').map(Number);
const CROOMID = process.env.CROOMID.split(',').map(Number);

function runSpawn(roomid, name, title, timeid, path, eventid) {
  return new Promise((resolve, reject) => {

    const EventId = eventid
    const text = `${timeid}_${title}`
    const beforePath = `${BILIFILE}/${path}`;
    const afterRclone = `${RCLONEDIR}${roomid}-${name}/${timeid}`;
    const afterdir = `${BILIFILE}/${roomid}-${name}/${timeid}`;

    function Touch() {
      return new Promise((resolve, reject) => {
        let finishedProcessesCount = 0;

        const mkdir = spawn('mkdir', [`${afterdir}`]);
        const touchTxt = spawn('touch', [`${beforePath}.txt`]);
        const touchJpg = spawn('touch', [`${beforePath}.cover.jpg`]);
        const touchPng = spawn('touch', [`${beforePath}.cover.png`]);

        const handleProcessClose = () => {
          finishedProcessesCount++;
          if (finishedProcessesCount === 4) {
            console.log(`[ Touch-exit  ] (${EventId}): ${finishedProcessesCount === 4 ? 0 : 1}`)
            resolve();
          }
        };

        mkdir.on('close', handleProcessClose)
        touchTxt.on('close', handleProcessClose)
        touchJpg.on('close', handleProcessClose)
        touchPng.on('close', handleProcessClose)
        mkdir.on('error', reject);
        touchTxt.on('error', reject);
        touchJpg.on('error', reject);
        touchPng.on('error', reject);

      })
    }
    function Mvall() {
      return new Promise((resolve, reject) => {
        let finishedProcessesCount = 0;

        const mvFlv = spawn('mv', [`${beforePath}.flv`, `${afterdir}/${text}.flv`])
        const mvTxt = spawn('mv', [`${beforePath}.txt`, `${afterdir}/${text}.txt`])
        const mvJpg = spawn('mv', [`${beforePath}.cover.jpg`, `${afterdir}/${text}.cover.jpg`])
        const mvPng = spawn('mv', [`${beforePath}.cover.png`, `${afterdir}/${text}.cover.png`])
        const mvXml = spawn('mv', [`${beforePath}.xml`, `${afterdir}/${text}.xml`])

        const handleProcessClose = () => {
          finishedProcessesCount++;
          if (finishedProcessesCount === 5) {
            console.log(`[ Mvall-exit  ] (${EventId}): ${finishedProcessesCount === 5 ? 0 : 1}`)
            resolve();
          }
        };

        mvFlv.on('close', handleProcessClose)
        mvTxt.on('close', handleProcessClose)
        mvJpg.on('close', handleProcessClose)
        mvPng.on('close', handleProcessClose)
        mvXml.on('close', handleProcessClose)
        mvFlv.on('error', reject);
        mvTxt.on('error', reject);
        mvJpg.on('error', reject);
        mvPng.on('error', reject);
        mvXml.on('error', reject);

      })
    }
    function FFmpeg() {

      return new Promise((resolve, reject) => {
        let finishedProcessesCount = 0;
        //弹幕处理有BUG,xml没有弹幕的时候会卡住，无法结束进程
        const danmucl = spawn(DANMUFC, ['-o', 'ass', `${afterdir}/${text}.ass`, '-i', 'xml', `${afterdir}/${text}.xml`,'--ignore-warnings'])
        const FFmpeg = spawn('ffmpeg', ['-v', '24', '-i', `${afterdir}/${text}.flv`, '-vn', '-acodec', 'copy', `${afterdir}/${text}.m4a`])
        danmucl.stderr.on('data', data => console.log(`[ danmu-stderr] (${EventId}): ${data}`));
        FFmpeg.stderr.on('data', data => console.log(`[FFmpeg-stderr] (${EventId}): ${data}`));

        const handleProcessClose = () => {
          finishedProcessesCount++;
          if (finishedProcessesCount === 2) {
            console.log(`[FFmpeg-exit  ] (${EventId}): ${finishedProcessesCount === 2 ? 0 : 1}`)
            resolve();
          }
        };

        /* danmucl.on('close',code=> console.log(`[danmucl-exit ] (${EventId}): ${code}`))
        FFmpeg.on('close',code=> {
          console.log(`[FFmpeg-exit  ] (${EventId}): ${code}`)
          resolve();
        }) */
        
        danmucl.on('close', handleProcessClose)
        FFmpeg.on('close', handleProcessClose)
        danmucl.on('error', reject);
        FFmpeg.on('error', error => {
          console.log(`[FFmpeg-error ] (${EventId}): ${error}`)
          reject()
        });

      });
    }

    Touch()
    .then(() => Mvall())
    .then(() => FFmpeg())
    .then(() => {
      if (!WROOMID.includes(Number(roomid))) {
        //console.log(!WROOMID.includes(Number(roomid)))
        if (!BROOMID.includes(Number(roomid))) {
          //console.log(!BROOMID.includes(Number(roomid)))
          if (!CROOMID.includes(Number(roomid))) {//不转码
            //console.log(!CROOMID.includes(Number(roomid)))
            const rclone = spawn('rclone', ['copy', `${afterdir}/`, `${afterRclone}/`, '--include', '*.flv', '--include', '*.m4a', '--include', '*.ass', '-q']);
            rclone.stdout.on('data', data => console.log(`[rclone-stdout] (${EventId}): ${data}`));
            rclone.stderr.on('data', data => console.log(`[rclone-stderr] (${EventId}): ${data}`));
            rclone.on('close', code => {
              console.log(`[rclone-exit  ] (${EventId}): ${code}`)
              resolve()
            });
            rclone.on('error', error => console.log(`[rclone-error ] (${EventId}): ${error}`));
          } else {//转码
            console.log(`[  CODE-stdout] (${EventId}): 开始转码`)

            const ffmpeg = spawn('ffmpeg', ['-v', '16', '-threads', '2', '-i', `${afterdir}/${text}.flv`, '-c:v', 'libx264', '-crf', '22', '-preset', FFmpegLEVEL, '-c:a', 'copy', `${afterdir}/${text}.mp4`]);
            ffmpeg.stdout.on('data', data => console.log(`[ffmpeg-stdout] (${EventId}): ${data}`));
            ffmpeg.stderr.on('data', data => console.log(`[ffmpeg-stderr] (${EventId}): ${data}`));
            ffmpeg.on('close', code => {
              console.log(`[ffmpeg-exit  ] (${EventId}): ${code}`)

              const rclone = spawn('rclone', ['copy', `${afterdir}/`, `${afterRclone}/`, '--include', '*.mp4', '--include', '*.m4a', '--include', '*.ass', '-q']);
              rclone.stdout.on('data', data => console.log(`[rclone-stdout] (${EventId}): ${data}`));
              rclone.stderr.on('data', data => console.log(`[rclone-stderr] (${EventId}): ${data}`));
              rclone.on('close', code => {
                console.log(`[rclone-exit  ] (${EventId}): ${code}`)
                resolve()
              });
              rclone.on('error', error => console.log(`[rclone-error ] (${EventId}): ${error}`));

            });

            ffmpeg.on('error', error => console.log(`[ffmpeg-error ] (${EventId}): ${error}`));
          }
        } else {//黑名单
          const rclone = spawn('rclone', ['copy', `${afterdir}/`, `${afterRclone}/`, '--include', '*.m4a', '--include', '*.ass', '-q']);
          rclone.stdout.on('data', data => console.log(`[rclone-stdout] (${EventId}): ${data}`));
          rclone.stderr.on('data', data => console.log(`[rclone-stderr] (${EventId}): ${data}`));
          rclone.on('close', code => {
            console.log(`[rclone-exit  ] (${EventId}): ${code}`)
            resolve()
          });
          rclone.on('error', error => console.log(`[rclone-error ] (${EventId}): ${error}`));

        }
      } else {//白名单
        const rclone = spawn('rclone', ['copy', `${afterdir}/`, `${afterRclone}/`, '--min-size', '1b', '--onedrive-chunk-size', '25600k', '--transfers', '5', '-q']);
        rclone.stdout.on('data', data => console.log(`[rclone-stdout] (${EventId}): ${data}`));
        rclone.stderr.on('data', data => console.log(`[rclone-stderr] (${EventId}): ${data}`));
        rclone.on('close', code => {
          console.log(`[rclone-exit  ] (${EventId}): ${code}`)
          resolve()
        });
        rclone.on('error', error => console.log(`[rclone-error ] (${EventId}): ${error}`));

      }

    })
    .catch(error => {
      // 处理错误
      reject(error);
    });
  });

}

module.exports = runSpawn;