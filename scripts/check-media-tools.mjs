import {execFileSync} from 'node:child_process';
import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
const options={encoding:'utf8',timeout:15000,maxBuffer:1024*1024,windowsHide:true};
try{
 const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',ffprobe=process.env.FFPROBE_PATH||'ffprobe';
 const version=execFileSync(ffmpeg,['-version'],options).split('\n')[0];
 const probe=execFileSync(ffprobe,['-version'],options).split('\n')[0];
 const encoders=execFileSync(ffmpeg,['-hide_banner','-encoders'],options);
 for(const codec of ['libx264','aac','mjpeg'])if(!new RegExp(`\\s${codec}\\s`).test(encoders))throw Error(`FFmpeg encoder missing: ${codec}`);
 console.log(`Media tools ready: ${version}; ${probe}`);
}catch(error){
 console.error('Media tools check failed. Install ffmpeg/ffprobe with H.264, AAC and JPEG support, or set FFMPEG_PATH and FFPROBE_PATH.');
 console.error(error.code||error.message);process.exitCode=1;
}
