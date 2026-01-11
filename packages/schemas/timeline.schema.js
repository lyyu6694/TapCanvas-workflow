import { z } from "zod";

export const TrackSchema = z.object({
  id: z.string(),
  type: z.enum(["video", "audio", "subtitle"]),
  src: z.string()
});

export const ShotSchema = z.object({
  id: z.string(),
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  tracks: z.array(TrackSchema).default([])
});

export const TimelineSchema = z.object({
  width: z.number().default(1920),
  height: z.number().default(1080),
  fps: z.number().default(30),
  shots: z.array(ShotSchema)
});

export const timelineSchema = TimelineSchema;

