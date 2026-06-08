# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont
import os

out_dir = r'C:\Users\ASUS\desktop\thesis_handoff_bundle\project\kotha\diagrams'
os.makedirs(out_dir, exist_ok=True)

try:
    font = ImageFont.truetype('arial.ttf', 13)
    font_sm = ImageFont.truetype('arial.ttf', 11)
    font_md = ImageFont.truetype('arial.ttf', 14)
    font_lg = ImageFont.truetype('arialbd.ttf', 16)
    font_title = ImageFont.truetype('arialbd.ttf', 20)
except Exception:
    font = ImageFont.load_default()
    font_sm = font_md = font_lg = font_title = font

def new_img(w, h, title):
    img = Image.new('RGB', (w, h), '#FFFFFF')
    d = ImageDraw.Draw(img)
    tw = d.textlength(title, font=font_title)
    d.text(((w - tw) / 2, 15), title, fill='#1565C0', font=font_title)
    return img, d

def box(d, x, y, w, h, label, color='#E3F2FD', border='#1565C0', f=None, sublabels=None):
    d.rounded_rectangle([x, y, x+w, y+h], radius=6, fill=color, outline=border, width=2)
    uf = f or font_md
    tw = d.textlength(label, font=uf)
    d.text((x + (w - tw) / 2, y + 6), label, fill=border, font=uf)
    if sublabels:
        for i, s in enumerate(sublabels):
            d.text((x + 10, y + 28 + i * 15), s, fill='#333', font=font_sm)

def arrow_down(d, x, y1, y2, label=''):
    d.line([(x, y1), (x, y2)], fill='#555', width=2)
    d.polygon([(x-5, y2-8), (x+5, y2-8), (x, y2)], fill='#555')
    if label:
        d.text((x+6, (y1+y2)//2 - 6), label, fill='#777', font=font_sm)

def arrow_right(d, x1, x2, y, label=''):
    d.line([(x1, y), (x2, y)], fill='#555', width=2)
    d.polygon([(x2-8, y-5), (x2-8, y+5), (x2, y)], fill='#555')
    if label:
        d.text(((x1+x2)//2 - 15, y - 16), label, fill='#777', font=font_sm)

def arrow_left(d, x1, x2, y, label=''):
    d.line([(x1, y), (x2, y)], fill='#555', width=2)
    d.polygon([(x2+8, y-5), (x2+8, y+5), (x2, y)], fill='#555')
    if label:
        d.text(((x1+x2)//2 - 15, y - 16), label, fill='#777', font=font_sm)

def arrow_up(d, x, y1, y2, label=''):
    d.line([(x, y1), (x, y2)], fill='#555', width=2)
    d.polygon([(x-5, y2+8), (x+5, y2+8), (x, y2)], fill='#555')
    if label:
        d.text((x+6, (y1+y2)//2 - 6), label, fill='#777', font=font_sm)

def table_box(d, x, y, name, cols, w=220):
    h = 30 + len(cols) * 20
    d.rounded_rectangle([x, y, x+w, y+h], radius=6, fill='#E3F2FD', outline='#1565C0', width=2)
    d.rounded_rectangle([x, y, x+w, y+28], radius=6, fill='#1565C0')
    tw = d.textlength(name, font=font_md)
    d.text((x + (w - tw) / 2, y + 6), name, fill='white', font=font_md)
    for i, col in enumerate(cols):
        d.text((x + 10, y + 32 + i * 20), col, fill='#333', font=font_sm)


# ═══════════════════════════════════════════════════════
# Figure 4.5: Detailed System Architecture
# ═══════════════════════════════════════════════════════
img, d = new_img(1300, 850, 'Figure 4.5: System Architecture Diagram')

# --- User layer ---
d.rounded_rectangle([500, 50, 800, 82], radius=8, fill='#FFF3E0', outline='#E65100', width=2)
d.text((560, 56), 'User (Voice / Touch)', fill='#E65100', font=font_lg)
arrow_down(d, 650, 82, 110)

# --- Client layer ---
d.rounded_rectangle([80, 110, 1220, 290], radius=8, fill='#E8F5E9', outline='#2E7D32', width=2)
d.text((530, 116), 'React Client (Browser / PWA)', fill='#2E7D32', font=font_lg)
box(d, 100, 145, 210, 120, 'Voice Engine', '#C8E6C9', '#2E7D32',
    sublabels=['VAD (threshold=3, 900ms)', 'MediaRecorder (webm/opus)', 'Echo prevention + Ding cue'])
box(d, 330, 145, 210, 120, 'UI Pages (10)', '#C8E6C9', '#2E7D32',
    sublabels=['Login / Home / Recipient', 'Amount / Confirm / PIN', 'Result / Balance / Error'])
box(d, 560, 145, 210, 120, 'Session Hook', '#C8E6C9', '#2E7D32',
    sublabels=['State + slot management', 'Loading guard', 'Transcript dedup (4s)'])
box(d, 790, 145, 210, 120, 'Controls', '#C8E6C9', '#2E7D32',
    sublabels=['Back navigation button', 'Voice on/off toggle', 'Quick-phrase buttons'])

arrow_down(d, 200, 290, 330, 'audio blob')
arrow_down(d, 660, 290, 330, 'JSON API')

# --- Server layer ---
d.rounded_rectangle([80, 330, 1220, 680], radius=8, fill='#E3F2FD', outline='#1565C0', width=2)
d.text((540, 336), 'Node.js / Express Server', fill='#1565C0', font=font_lg)

box(d, 100, 365, 200, 65, '/api/stt', '#BBDEFB', '#1565C0',
    sublabels=['gpt-4o-transcribe', 'Bengali script enforced'])
box(d, 330, 365, 230, 65, '/api/voice-turn', '#BBDEFB', '#1565C0',
    sublabels=['Transcript -> Orchestrator', 'Returns prompt + UI config'])
box(d, 590, 365, 200, 65, '/api/tap', '#BBDEFB', '#1565C0',
    sublabels=['Touch event handler', 'Back / Home navigation'])
box(d, 820, 365, 210, 65, '/api/tts', '#BBDEFB', '#1565C0',
    sublabels=['Google Translate TTS', 'Bangla audio proxy'])

box(d, 280, 460, 420, 70, 'Orchestrator (Plan-based FSM)', '#FFF9C4', '#F57F17',
    sublabels=['Stage navigation + branching + slot filling', 'Validation + post-transaction flow'])
box(d, 100, 470, 160, 55, 'LLM Classifier', '#F3E5F5', '#7B1FA2',
    sublabels=['gpt-4.1-mini (primary)', 'Screen-aware prompts'])
box(d, 720, 470, 160, 55, 'Plan Registry', '#FFF9C4', '#F57F17',
    sublabels=['7 JSON plan files'])
box(d, 910, 470, 160, 55, 'Prompt Store', '#FFF9C4', '#F57F17',
    sublabels=['86 Bangla strings'])

box(d, 100, 560, 160, 55, 'Rule Fallback', '#F3E5F5', '#7B1FA2',
    sublabels=['Keyword + fuzzy match'])
box(d, 290, 560, 170, 55, 'Number Parser', '#FFF9C4', '#F57F17',
    sublabels=['Bangla digits + words'])
box(d, 490, 560, 160, 55, 'SQLite DB', '#E8EAF6', '#283593',
    sublabels=['Accounts + ledger'])
box(d, 680, 560, 170, 55, 'Event Logger', '#E8EAF6', '#283593',
    sublabels=['debug_log.jsonl'])
box(d, 880, 560, 170, 55, 'Metrics Store', '#E8EAF6', '#283593',
    sublabels=['SUS + task timing'])

# --- External layer ---
d.rounded_rectangle([100, 720, 400, 800], radius=8, fill='#FCE4EC', outline='#C62828', width=2)
d.text((170, 728), 'OpenAI API', fill='#C62828', font=font_lg)
d.text((115, 752), 'gpt-4o-transcribe + gpt-4.1-mini', fill='#555', font=font_sm)

d.rounded_rectangle([450, 720, 750, 800], radius=8, fill='#FCE4EC', outline='#C62828', width=2)
d.text((510, 728), 'Google Translate TTS', fill='#C62828', font=font_lg)
d.text((485, 752), 'Bangla text-to-speech audio', fill='#555', font=font_sm)

d.rounded_rectangle([800, 720, 1100, 800], radius=8, fill='#E8F5E9', outline='#2E7D32', width=2)
d.text((870, 728), 'Render (Deploy)', fill='#2E7D32', font=font_lg)
d.text((830, 752), 'Static build + Express server', fill='#555', font=font_sm)

arrow_down(d, 250, 680, 720)
arrow_down(d, 600, 680, 720)
arrow_down(d, 950, 680, 720)

img.save(os.path.join(out_dir, 'fig_4.5_system_architecture.png'))
print('4.5 done')


# ═══════════════════════════════════════════════════════
# Figure 4.7: Voice Processing Pipeline
# ═══════════════════════════════════════════════════════
img, d = new_img(1250, 520, 'Figure 4.7: Voice Processing Pipeline')

steps = [
    ('User Speaks', '#FFF3E0', '#E65100', ['Bangla voice input', 'After ding cue']),
    ('VAD Detection', '#E8F5E9', '#2E7D32', ['Start threshold: 3', 'Silence: 900ms', 'Min record: 500ms']),
    ('MediaRecorder', '#E3F2FD', '#1565C0', ['Format: webm/opus', 'Min blob: 3KB', 'Echo cancellation']),
    ('gpt-4o-transcribe', '#FCE4EC', '#C62828', ['language: "bn"', 'temp: 0', 'Bengali enforcement']),
    ('Transcript Filter', '#F3E5F5', '#7B1FA2', ['Bengali chars required', 'Max 80 chars', 'Block hallucination']),
    ('LLM Classifier', '#FCE4EC', '#C62828', ['gpt-4.1-mini', 'Screen-aware prompt', 'Rules fallback']),
    ('Orchestrator', '#FFF9C4', '#F57F17', ['Match branch', 'Fill slot', 'Advance stage']),
    ('TTS Response', '#E8EAF6', '#283593', ['Google Translate', 'Bangla audio', 'Play to speaker']),
]
for i, (lbl, clr, bdr, subs) in enumerate(steps):
    x = 18 + i * 153
    box(d, x, 65, 140, 120, lbl, clr, bdr, font_sm, subs)
    if i < len(steps)-1:
        arrow_right(d, x+140, x+153, 125)

# Echo prevention box
d.rounded_rectangle([18, 215, 1232, 275], radius=6, fill='#E8F5E9', outline='#2E7D32', width=2)
d.text((28, 222), 'Echo Prevention Flow:', fill='#2E7D32', font=font_lg)
d.text((28, 245), 'TTS finishes  ->  200ms wait  ->  play DING  ->  teardown mic  ->  200ms wait  ->  init fresh mic  ->  start VAD', fill='#2E7D32', font=font_md)

# Dedup box
d.rounded_rectangle([18, 285, 1232, 325], radius=6, fill='#FFF3E0', outline='#E65100', width=2)
d.text((28, 292), 'Safety Guards:', fill='#E65100', font=font_lg)
d.text((175, 295), 'Transcript dedup (4s window)  |  Bengali-only filter (blocks Thai/Hindi/Latin)  |  Hallucination filter (>80 chars / prompt echo)', fill='#555', font=font_sm)

# Latency table
d.rounded_rectangle([18, 340, 1232, 500], radius=8, fill='#FFF8E1', outline='#FF8F00', width=2)
d.text((530, 348), 'Latency Breakdown', fill='#FF8F00', font=font_lg)
d.line([(18, 370), (1232, 370)], fill='#FFE082', width=1)

lat = [
    ('Component', 'Latency', True),
    ('VAD silence detection', '900ms (fixed)', False),
    ('Audio upload + STT (gpt-4o-transcribe)', '800 - 1,200ms', False),
    ('LLM classification (gpt-4.1-mini)', '300 - 700ms', False),
    ('Orchestrator logic (local)', '< 5ms', False),
    ('TTS fetch + playback (Google)', '300 - 800ms', False),
    ('Total perceived round-trip', '~ 2 - 3 seconds', False),
]
for i, (comp, ms, is_header) in enumerate(lat):
    y = 378 + i * 18
    f = font_md if is_header else font_sm
    clr = '#333' if is_header else '#555'
    d.text((38, y), comp, fill=clr, font=f)
    d.text((450, y), ms, fill='#E65100' if not is_header else '#333', font=f)

img.save(os.path.join(out_dir, 'fig_4.7_voice_pipeline.png'))
print('4.7 done')


# ═══════════════════════════════════════════════════════
# Figure 4.13: Error Recovery Workflow
# ═══════════════════════════════════════════════════════
img, d = new_img(920, 620, 'Figure 4.13: Error Recovery Workflow')

box(d, 350, 50, 220, 35, 'User Voice Input', '#E3F2FD', '#1565C0')
arrow_down(d, 460, 85, 115)

box(d, 350, 115, 220, 35, 'STT + LLM Classify', '#F3E5F5', '#7B1FA2')
arrow_down(d, 460, 150, 180)

# Decision: recognized?
d.rounded_rectangle([380, 180, 540, 215], radius=4, fill='#FFF9C4', outline='#F57F17', width=2)
d.text((405, 188), 'Recognized?', fill='#F57F17', font=font_md)

d.line([(540, 197), (630, 197)], fill='#4CAF50', width=2)
d.text((555, 182), 'Yes', fill='#4CAF50', font=font_md)
box(d, 630, 180, 220, 35, 'Fill Slot + Advance', '#E8F5E9', '#2E7D32')

arrow_down(d, 460, 215, 260)
d.text((465, 225), 'No', fill='#F44336', font=font_md)

# Decision: retry < 3?
d.rounded_rectangle([370, 260, 550, 295], radius=4, fill='#FFF9C4', outline='#F57F17', width=2)
d.text((390, 268), 'Retry count < 3?', fill='#F57F17', font=font_md)

d.line([(550, 277), (630, 277)], fill='#4CAF50', width=2)
d.text((560, 262), 'Yes', fill='#4CAF50', font=font_md)
box(d, 630, 250, 240, 35, 'Retry 1: "Please say again"', '#FFF9C4', '#F57F17')
box(d, 630, 295, 240, 35, 'Retry 2: "Try one more time"', '#FFF9C4', '#F57F17')

arrow_down(d, 460, 295, 345)
d.text((465, 305), 'Max retries', fill='#F44336', font=font_sm)

# Modality switch
box(d, 330, 345, 260, 50, 'Modality Switch', '#FCE4EC', '#C62828',
    sublabels=['"Please tap the icon instead"'])

arrow_down(d, 460, 395, 435)

# Decision: tap worked?
d.rounded_rectangle([370, 435, 550, 470], radius=4, fill='#FFF9C4', outline='#F57F17', width=2)
d.text((388, 443), 'Tap succeeded?', fill='#F57F17', font=font_md)

d.line([(550, 452), (630, 452)], fill='#4CAF50', width=2)
d.text((560, 437), 'Yes', fill='#4CAF50', font=font_md)
box(d, 630, 435, 220, 35, 'Continue Flow', '#E8F5E9', '#2E7D32')

arrow_down(d, 460, 470, 515)
d.text((465, 480), 'No', fill='#F44336', font=font_md)

box(d, 350, 515, 220, 35, 'Abort -> Return Home', '#FCE4EC', '#C62828')

# Legend
d.rounded_rectangle([30, 520, 280, 600], radius=6, fill='#F5F5F5', outline='#CCC', width=1)
d.text((40, 528), 'Legend:', fill='#333', font=font_md)
d.rounded_rectangle([40, 548, 60, 562], radius=2, fill='#FFF9C4', outline='#F57F17', width=1)
d.text((68, 548), 'Decision point', fill='#555', font=font_sm)
d.rounded_rectangle([40, 570, 60, 584], radius=2, fill='#E8F5E9', outline='#2E7D32', width=1)
d.text((68, 570), 'Success path', fill='#555', font=font_sm)
d.rounded_rectangle([150, 548, 170, 562], radius=2, fill='#FCE4EC', outline='#C62828', width=1)
d.text((178, 548), 'Failure path', fill='#555', font=font_sm)

img.save(os.path.join(out_dir, 'fig_4.13_error_recovery.png'))
print('4.13 done')


# ═══════════════════════════════════════════════════════
# Figure 4.14: Database Schema
# ═══════════════════════════════════════════════════════
img, d = new_img(1100, 560, 'Figure 4.14: SQLite Database Schema')

table_box(d, 50, 55, 'participants', [
    'id TEXT PRIMARY KEY',
    'name TEXT NOT NULL',
    'pin TEXT NOT NULL',
    'balance INTEGER DEFAULT 50000',
    'created_at TEXT',
], w=240)

table_box(d, 350, 55, 'recipients', [
    'id TEXT PRIMARY KEY',
    'name TEXT NOT NULL',
    'phone TEXT NOT NULL',
    'photo_url TEXT',
    'participant_id TEXT FK',
], w=230)

table_box(d, 650, 55, 'agents', [
    'id TEXT PRIMARY KEY',
    'name TEXT NOT NULL',
    'phone TEXT NOT NULL',
    'location TEXT',
], w=220)

table_box(d, 50, 240, 'sessions', [
    'id TEXT PRIMARY KEY',
    'participant_id TEXT FK',
    'created_at TEXT',
], w=230)

table_box(d, 350, 240, 'ledger', [
    'id TEXT PRIMARY KEY',
    'session_id TEXT FK',
    'participant_id TEXT FK',
    'type TEXT (send/cashout/...)',
    'amount INTEGER',
    'counterparty TEXT',
    'created_at TEXT',
], w=260)

table_box(d, 700, 240, 'voice_events', [
    'id TEXT PRIMARY KEY',
    'session_id TEXT FK',
    'kind TEXT',
    'data JSON',
    'created_at TEXT',
], w=240)

table_box(d, 50, 430, 'credentials', [
    'id TEXT PRIMARY KEY',
    'participant_id TEXT FK',
    'credential_id TEXT UNIQUE',
    'public_key TEXT',
    'created_at TEXT',
], w=260)

# Relationship lines
d.line([(290, 95), (350, 95)], fill='#F57F17', width=2)
d.text((300, 78), '1:N', fill='#F57F17', font=font_sm)

d.line([(160, 185), (160, 240)], fill='#F57F17', width=2)
d.text((165, 208), '1:N', fill='#F57F17', font=font_sm)

d.line([(280, 280), (350, 280)], fill='#F57F17', width=2)
d.text((298, 263), '1:N', fill='#F57F17', font=font_sm)

d.line([(610, 310), (700, 310)], fill='#F57F17', width=2)
d.text((640, 293), '1:N', fill='#F57F17', font=font_sm)

d.line([(160, 320), (160, 430)], fill='#F57F17', width=2)
d.text((165, 370), '1:N', fill='#F57F17', font=font_sm)

img.save(os.path.join(out_dir, 'fig_4.14_db_schema.png'))
print('4.14 done')


# ═══════════════════════════════════════════════════════
# Figure 4.15: Evaluation Logging Architecture
# ═══════════════════════════════════════════════════════
img, d = new_img(1050, 520, 'Figure 4.15: Evaluation Logging Architecture')

box(d, 380, 50, 250, 55, 'User Interaction', '#FFF3E0', '#E65100',
    sublabels=['Voice / Touch / Text input'])
arrow_down(d, 505, 105, 140)

# Log sources row
box(d, 50, 140, 200, 60, 'STT Log', '#E3F2FD', '#1565C0',
    sublabels=['Raw transcript + latency (ms)'])
box(d, 280, 140, 200, 60, 'Classifier Log', '#F3E5F5', '#7B1FA2',
    sublabels=['LLM prompt/response + ms'])
box(d, 510, 140, 200, 60, 'Orchestrator Log', '#FFF9C4', '#F57F17',
    sublabels=['Stage, slots, branch taken'])
box(d, 740, 140, 200, 60, 'Task Metrics', '#E8F5E9', '#2E7D32',
    sublabels=['Completion time, retries'])

arrow_right(d, 250, 280, 170)
arrow_right(d, 480, 510, 170)
arrow_right(d, 710, 740, 170)
arrow_down(d, 150, 200, 245)
arrow_down(d, 380, 200, 245)
arrow_down(d, 610, 200, 245)
arrow_down(d, 840, 200, 245)

# Central log store
box(d, 200, 245, 560, 65, 'debug_log.jsonl', '#E8EAF6', '#283593',
    sublabels=['Every event: {timestamp, event_type, transcript, stage, slots, latency_ms}',
               'Append-only — one JSON line per voice turn / tap / system event'])
arrow_down(d, 480, 310, 350)

# Session export
box(d, 200, 350, 560, 75, 'Session Export (JSON)', '#E8EAF6', '#283593',
    sublabels=['Complete interaction history per participant session',
               'Task completion status, retry count, modality switches',
               'SUS survey responses + per-task timing data'])

# Thesis metrics sidebar
d.rounded_rectangle([50, 245, 185, 440], radius=8, fill='#FCE4EC', outline='#C62828', width=2)
d.text((62, 253), 'Thesis Metrics', fill='#C62828', font=font_md)
metrics = [
    'Task completion rate',
    'Average retries/task',
    'Modality switches',
    'STT accuracy',
    'Avg round-trip latency',
    'Help requests',
    'SUS score (0-100)',
]
for i, m in enumerate(metrics):
    d.text((58, 275 + i * 22), m, fill='#555', font=font_sm)

img.save(os.path.join(out_dir, 'fig_4.15_logging.png'))
print('4.15 done')


print(f'\nAll 5 diagrams saved to: {out_dir}')
print('Skipped: 4.6 (home), 4.8 (auth), 4.9 (send money), 4.10 (cash out), 4.11 (recharge), 4.12 (balance) — take screenshots from app.')
