import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';
import { tryJobLeader } from '../../src/lib/scaling/job-leader.js';
import { initializeSharedRuntime, closeSharedRuntime } from '../../src/lib/scaling/shared-runtime.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { syncAudioPresence, releaseSharedAudioRoom } from '../../src/lib/scaling/room-presence.js';
import { withClaimedEvents, emitDurable } from '../../src/lib/scaling/outbox-claim.js';
import { createBackgroundCoordinator } from '../../src/lib/scaling/background-coordinator.js';
import { runExclusiveJob, dispatchBatch, updatePresence } from '../../src/lib/scaling/transaction-worker.js';

const pool = new pg.Pool({ connectionString: process.env.SCALING_LAB_DATABASE_URL, max: 3 });
process.env.DATABASE_URL = process.env.SCALING_LAB_DATABASE_URL;
process.env.PORTAL_REDIS_URL = process.env.SCALING_LAB_REDIS_URL;
process.env.PORTAL_REDIS_NAMESPACE = process.env.SCALING_LAB_NAMESPACE;
const redis = await initializeSharedRuntime();
const db = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.SCALING_LAB_DATABASE_URL})});
const coordinator = await createBackgroundCoordinator({connectionString:process.env.SCALING_LAB_DATABASE_URL,enabled:true,intervalMs:100});
const http = createServer((_req,res) => { res.writeHead(redis.ready() ? 200 : 503); res.end(); });
let leader;
const io = new Server(http);
redis.attach(io);
io.on('connection', socket => {
  socket.data.userId = socket.handshake.auth.userId;
  socket.join('lab-room');
  socket.join('audio-room:actual-room');
  socket.emit('joined');
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
process.send({ ready: true, port: http.address().port });
process.on('message', async ({ id, command, args = {} }) => {
  try {
    let value;
    switch (command) {
      case 'actualExpiry': await (await import('../../src/lib/scaling/expiry-sweeper.js')).sweepExpiries(db,io); value=true; break;
      case 'actualLeader': value = coordinator.leader(); break;
      case 'actualPresence': {
        const room = await db.audioRoom.findUnique({where:{roomId:'actual-room'},include:{owner:{select:{publicId:true}}}});
        const snapshot = await syncAudioPresence(db,io,room,redis);
        value = snapshot.total; break;
      }
      case 'actualRelease': {
        const room = await db.audioRoom.findUnique({where:{roomId:'actual-room'},include:{owner:{select:{publicId:true}}}});
        value = await releaseSharedAudioRoom(db,io,room,redis); break;
      }
      case 'grace': await redis.setGrace('actual-room',args.userId,args.until); value=true; break;
      case 'clearGrace': await redis.clearGrace('actual-room',args.userId); value=true; break;
      case 'giftPresence': value=await redis.giftPresence(args.userId,'actual-room',args.action,args.now);break;
      case 'giftIntervals': value=await redis.giftIntervals(args.userId,'actual-room');break;
      case 'actualDispatch': value=await withClaimedEvents(db,'realtimeOutbox',null,async(rows,tx)=>{
        for(const row of rows) {
          await emitDurable(io,row.channel,row.event,{...row.payload,eventId:row.id});
          if(args.failAfterSend)throw Error('INJECTED_AFTER_SEND_FAILURE');
          await tx.realtimeOutbox.update({where:{id:row.id},data:{deliveredAt:new Date(),attempts:{increment:1}}});
        }
        return rows.length;
      }); break;
      case 'leader': leader ??= await tryJobLeader(pool, 'lab-jobs'); value = Boolean(leader?.owned); break;
      case 'leaderJob': if (!leader) throw Error('NOT_LEADER'); await leader.run(async db => { await db.query('INSERT INTO scaling_job_runs(id) VALUES ($1) ON CONFLICT DO NOTHING', [args.id]); }); value = true; break;
      case 'rate': value = await redis.isRateLimited('same-user', { limit: 6, windowMs: 60000 }); break;
      case 'set': value = await redis.set(args.key, args.value, args.ttl); break;
      case 'get': value = await redis.get(args.key); break;
      case 'sequence': value = await redis.nextSequence('room-top-gifter', 60000); break;
      case 'sockets': value = (await io.in('lab-room').fetchSockets()).map(s => s.data.userId); break;
      case 'broadcast': io.to('lab-room').emit('lab:event', { eventId: args.eventId }); break;
      case 'presence': value = await updatePresence(pool, args); break;
      case 'job': value = await runExclusiveJob(pool, 'salary-fixture', async db => {
        await db.query('SELECT pg_sleep($1)', [args.delay ?? 0.1]);
        await db.query("INSERT INTO scaling_job_runs (id) VALUES ('cycle-1') ON CONFLICT DO NOTHING");
      }); break;
      case 'dispatch': value = await dispatchBatch(pool, async row => {
        io.to(row.channel).emit(row.event, row.payload);
        if (args.failAfterSend) throw new Error('INJECTED_AFTER_SEND_FAILURE');
      }); break;
      case 'stop': await leader?.close(); await coordinator.stop(); await db.$disconnect(); await closeSharedRuntime(); await new Promise(resolve => io.close(resolve)); await pool.end(); process.send({ id, value: true }); process.exit(0); break;
      default: throw new Error('Unknown lab command');
    }
    process.send({ id, value });
  } catch (error) { process.send({ id, error: error.message }); }
});
