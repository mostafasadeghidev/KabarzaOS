import { describe, expect, it } from 'vitest';
import {
  clock, dropStill, frameGap, isLoomMediaUrl, MAX_FRAMES, nearestFrame, parseLoomUrl, transcriptLines, videoMessage, withoutLoomUrl,
} from './media';
import { hasImages, stripImages, trimHistory, type ChatMessage } from './chat';
import { toResponsesInput } from './responses';
import { calendarAround } from './chat';

describe('video helpers', () => {
  it('formats clock times', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(84.7)).toBe('1:24');
    expect(clock(3725)).toBe('1:02:05');
  });

  it('keeps the frame count under the cap', () => {
    expect(frameGap(30)).toBe(3);
    expect(Math.ceil(900 / frameGap(900))).toBeLessThanOrEqual(MAX_FRAMES);
  });

  it('finds Loom links and strips them from the request', () => {
    const id = '0281766fa2d04bb788eaf19e65135184';
    expect(parseLoomUrl(`please review https://www.loom.com/share/${id}?sid=x`)).toEqual({ id, url: `https://www.loom.com/share/${id}` });
    expect(parseLoomUrl(`https://loom.com/share/homepage-fixes-${id}`)?.id).toBe(id);
    expect(parseLoomUrl('https://example.com/share/abc')).toBeNull();
    expect(withoutLoomUrl(`add to review https://www.loom.com/share/${id}`)).toBe('add to review');
  });

  it('accepts only Loom HTTPS media urls', () => {
    expect(isLoomMediaUrl('https://cdn.loom.com/sessions/transcoded/x.mp4?Policy=1')).toBe(true);
    expect(isLoomMediaUrl('http://cdn.loom.com/x.mp4')).toBe(false);
    expect(isLoomMediaUrl('https://evil.example/loom.com/x.mp4')).toBe(false);
    expect(isLoomMediaUrl('https://loom.com.evil.example/x.mp4')).toBe(false);
  });

  it('picks the nearest frame and drops still ones', () => {
    const frames = [{ t: 0 }, { t: 10 }, { t: 20 }];
    expect(nearestFrame(frames, 13)?.t).toBe(10);
    expect(nearestFrame([], 5)).toBeNull();
    expect(dropStill([{ size: 52798 }, { size: 52798 }, { size: 52909 }, { size: 52910 }]).map((f) => f.size)).toEqual([52798, 52909]);
  });

  it('builds a timestamped transcript and a multimodal message', () => {
    expect(transcriptLines([{ start: 3, end: 5, text: ' the  button ' }, { start: 62, end: 70, text: 'is broken' }]))
      .toBe('[0:03] the button\n[1:02] is broken');
    const parts = videoMessage({
      instruction: '', duration: 90, url: 'https://www.loom.com/share/x', segments: [],
      frames: [{ t: 42, dataUrl: 'data:image/jpeg;base64,AAA' }],
    });
    expect(parts[0]).toMatchObject({ type: 'text' });
    expect((parts[0] as { text: string }).text).toContain('1:30 long');
    expect(parts[1]).toEqual({ type: 'text', text: '[frame 0:42 = 42s]' });
    expect(parts[2]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } });
  });
});

describe('calendar for weekday names', () => {
  it('lists the days around today with their weekday', () => {
    const c = calendarAround('2026-10-16');
    expect(c).toContain('Thursday 2026-10-15');
    expect(c).toContain('Friday 2026-10-16');
    expect(c.split(', ')).toHaveLength(15);
    expect(calendarAround('bad')).toBe('');
  });
});

describe('images in the conversation', () => {
  const withImage: ChatMessage[] = [
    { role: 'system', content: 's' },
    { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,A' } }] },
  ];

  it('strips images for memory and for models without vision', () => {
    expect(hasImages(withImage)).toBe(true);
    expect(hasImages(stripImages(withImage))).toBe(false);
    expect(trimHistory(withImage)).toEqual([{ role: 'user', content: 'look\n[image]' }]);
  });

  it('maps images to the Responses API shape', () => {
    expect(toResponsesInput(withImage)[1]).toEqual({
      role: 'user',
      content: [{ type: 'input_text', text: 'look' }, { type: 'input_image', image_url: 'data:image/png;base64,A' }],
    });
  });
});
