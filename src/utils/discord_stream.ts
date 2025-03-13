import { Client } from "discord.js-selfbot-v13";
import { Streamer } from '@dank074/discord-video-stream';
import { prepareStream, playStream, Utils } from "@dank074/discord-video-stream";
import { getLogger } from './logger';
import { config } from './config';
import ffmpeg from 'fluent-ffmpeg';

const logger = getLogger();
const streamer = new Streamer(new Client());
let abortController = new AbortController();
let ffmpegCommand: ffmpeg.FfmpegCommand | null = null;
let currentPlayingUrl = '';
let isStreaming = false;

export async function initializeStreamer() {
    if (streamer.client.isReady()) {
        logger.debug('Streamer client is already logged in');
        return;
    }
    try {
        await (streamer.client as Client).login(config.DISCORD_USER_TOKEN);
        logger.info('Streamer client logged in successfully');
    } catch (error) {
        logger.error(`Error logging in streamer client: ${error}`);
    }
}

export async function joinVoiceChannel(guildId: string, channelId: string) {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }
    const connection = streamer.voiceConnection;
    if (connection && connection.channelId === channelId) {
        logger.debug(`Already connected to voice channel: ${channelId} in guild: ${guildId}`);
        return;
    }
    try {
        await streamer.joinVoice(guildId, channelId);
        logger.info(`Joined voice channel: ${channelId} in guild: ${guildId}`);
    } catch (error) {
        logger.error(`Error joining voice channel: ${error}`);
    }
}

export async function leaveVoiceChannel() {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }
    try {
        await stopStreaming();
        streamer.leaveVoice();
        logger.info('Stopped video stream and disconnected from the voice channel');
    } catch (error) {
        logger.error(`Error leaving voice channel: ${error}`);
    }
}

export async function startStreaming(videoUrl: string, duration: number) {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }

    try {
        currentPlayingUrl = videoUrl;

        const { command, output } = prepareStream(videoUrl, {
            noTranscoding: false,
            minimizeLatency: true,
            bitrateVideo: 5000,
            bitrateVideoMax: 7500,
            videoCodec: Utils.normalizeVideoCodec("H264"),
            h26xPreset: "veryfast",
        }, abortController.signal);

        ffmpegCommand = command;

        command.on("error", async (err: any, _stdout: any, _stderr: any) => {
            logger.error(`FFmpeg error: ${err}`);
        });

        // Set a timer to disconnect the streamer after the specified duration
        setTimeout(async () => {
            logger.info(`Stopping stream after ${duration} minutes`);
            await stopStreaming();
            await leaveVoiceChannel();
            logger.info(`Disconnected from the voice channel after ${duration} minutes`);
        }, duration * 60 * 1000); // Convert minutes to milliseconds

        await playStream(output, streamer, {
            type: "go-live",
        }, abortController.signal);

        // Since the above promise resolves when the stream is stopped, we can assume the stream has stopped
        logger.info(`Stream ${videoUrl} was stopped.`);
        /*
        if (currentPlayingUrl !== videoUrl && currentPlayingUrl !== '') {
            logger.info('Stupid thing killed new stream. Retrying...');
            logger.debug(`Retrying stream ${videoUrl}`);
            await startStreaming(currentPlayingUrl, duration);
        }
        */
    } catch (error) {
        logger.error(`Error starting stream: ${error}`);
        await stopStreaming();
    }
}

export async function stopStreaming() {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }

    if (!currentPlayingUrl) {
        logger.error('No stream is currently in progress');
        return;
    }

    try {
        abortController.abort();
        await new Promise(resolve => setTimeout(resolve, 1000));
        abortController = new AbortController();
        logger.info('Stopped playing video');
    } catch (error) {
        logger.error(`Error stopping stream: ${error}`);
    }
}