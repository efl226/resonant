# Resonant — User Testing Procedure

## Overview

This document outlines the testing methodology for Resonant, a music discovery visualization tool. Based on established UX research practices including Nielsen Norman Group's usability testing framework and think-aloud protocol methodology.

**Testing goal:** Identify usability issues, validate the core experience, and gather qualitative feedback to guide the next development phase.

**Sample size rationale:** Nielsen's research shows 5 users uncover ~85% of usability issues. With 5-10 testers, we expect to catch 85-95% of problems. This is a formative (iterative) test, not a summative validation — the goal is actionable insights, not statistical significance.

---

## Testing Format

We're using a **hybrid approach** combining three established methods:

1. **Task-Based Usability Testing** — give users specific tasks and observe if they can complete them
2. **Think-Aloud Protocol** — ask users to verbalize their thoughts as they explore
3. **Post-Session Survey** — structured feedback after the session

**Session length:** 20-30 minutes per tester
**Setting:** Remote (users on their own computers with their personalized URL) or in-person
**Equipment needed:** Their laptop/desktop (not mobile), Chrome or Firefox browser

---

## Pre-Test Setup

### For each tester, prepare:

1. Their personalized collection URL: `https://[your-domain]?collection=[username]`
2. Verify their collection loaded correctly (check node count, clusters, links)
3. Print or have ready: the task list, observation notes template, and post-session survey

### Collection requirements:
- Minimum 50 songs (fewer = sparse graph, weak clusters)
- Maximum 200 songs (more = longer load times)
- Ideally from playlists they actively listen to (not random songs)

---

## Test Session Script

### Introduction (2 minutes)

Read this to the tester (adapt for in-person vs remote):

> "Thanks for helping me test this! I'm building a tool that visualizes your music collection as an interactive map. Songs that sound similar are placed near each other, and there are connections between songs that share interesting relationships — like the same producer, shared musicians, or harmonic similarities.
>
> I'm going to send you a link to your personalized music map. I'd like you to explore it for about 15-20 minutes. As you explore, please think out loud — tell me what you're looking at, what you expect to happen, what confuses you, and what you find interesting. There are no wrong answers. I'm testing the tool, not you.
>
> After exploring freely, I'll ask you to try a few specific things. Then we'll wrap up with some quick questions."

### Phase 1: Free Exploration (5-7 minutes)

**Instructions to tester:** "Go ahead and open the link. Just explore however feels natural to you. Tell me what you see and what you're thinking."

**What to observe and note:**
- What do they look at first?
- Do they try to zoom/pan without being told?
- Do they click on a node? How long before their first click?
- Do they read the sidebar information?
- What do they comment on positively?
- Where do they seem confused or hesitate?
- Do they try the search bar on their own?

**Prompts if they go silent** (use sparingly):
- "What are you looking at right now?"
- "What do you think that is?"
- "What are you expecting to happen?"

### Phase 2: Guided Tasks (8-10 minutes)

Give these tasks one at a time. Don't help them — observe how they try to accomplish each task. Note whether they succeed, how long it takes, and any confusion.

**Task 1: Find a specific song**
> "Can you find [a song you know is in their collection] on the map?"

What to observe: Do they use search or try to visually scan? How long does it take?

**Task 2: Explore song details**
> "Click on a song you like and tell me what you find interesting about the information shown."

What to observe: Which sidebar sections do they read? Which do they skip? What surprises them?

**Task 3: Discover connections**
> "Look at the connections section for that song. What do the connections mean to you?"

What to observe: Do they understand what the connection types mean? Do they click on a connection to navigate?

**Task 4: Use intelligent search**
> "Try searching for a mood or vibe — something like 'dreamy' or 'upbeat' or whatever describes music you're in the mood for right now."

What to observe: Do they understand the search isn't just name-matching? Are they surprised by the results? Do they notice the graph filtering?

**Task 5: Filter exploration**
> "Click on one of the mood tags or instrument names in the sidebar. What happens?"

What to observe: Do they notice the breadcrumbs? Do they understand how to remove a filter? Do they try stacking filters?

**Task 6: Play a song**
> "Find a song you want to listen to and try to play it."

What to observe: Do they find the play button? Does the player persist as they navigate? Any confusion?

**Task 7: Understand the map layout**
> "Zoom out and look at the whole map. Can you tell me why certain songs are grouped together? What do the colored regions mean?"

What to observe: Do they understand the spatial relationships? Do the cluster names help or confuse them?

### Phase 3: Post-Task Questions (5 minutes)

Ask these verbally:

1. "What was the most interesting thing you discovered?"
2. "Was anything confusing or frustrating?"
3. "Did you find any connections between songs that surprised you?"
4. "What would make you want to come back and use this again?"
5. "If you could add one feature, what would it be?"
6. "Would you share this with a friend? What would you tell them about it?"

---

## Observation Notes Template

Use this during each session. One sheet per tester.

```
Tester: _______________     Date: _______________
Collection: ____________    Songs: ____

FIRST IMPRESSIONS (first 30 seconds)
- First action taken: _______________
- First comment: _______________
- Time to first node click: _____ seconds

TASK COMPLETION
Task 1 (Find song):      ☐ Success  ☐ Struggled  ☐ Failed  |  Method: Search / Visual
Task 2 (Song details):   ☐ Success  ☐ Struggled  ☐ Failed  |  Sections noticed: ________
Task 3 (Connections):    ☐ Success  ☐ Struggled  ☐ Failed  |  Clicked connection: Y/N
Task 4 (Mood search):    ☐ Success  ☐ Struggled  ☐ Failed  |  Query used: ___________
Task 5 (Filter/breadcrumb): ☐ Success  ☐ Struggled  ☐ Failed  |  Understood stacking: Y/N
Task 6 (Play song):      ☐ Success  ☐ Struggled  ☐ Failed  |  Player persist noticed: Y/N
Task 7 (Map layout):     ☐ Success  ☐ Struggled  ☐ Failed  |  Cluster names helpful: Y/N

NOTABLE QUOTES
"_____________________________________________"
"_____________________________________________"
"_____________________________________________"

CONFUSION POINTS
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

DELIGHT MOMENTS
1. _______________________________________________
2. _______________________________________________

FEATURE REQUESTS
1. _______________________________________________
2. _______________________________________________
```

---

## Post-Session Survey (Google Form)

Send this link after the session. Keep it short — 5 minutes max.

### Section 1: First Impressions

**Q1.** When you first opened the app, what was your initial reaction? *(Open text)*

**Q2.** Rate your first impression of the visual design. *(1-5 stars)*

**Q3.** Was it immediately clear what you were looking at? *(Yes / Somewhat / No)*

### Section 2: Exploration & Discovery

**Q4.** Did you discover any surprising connections between songs in your collection? If so, which ones? *(Open text)*

**Q5.** How accurately did the cluster labels (the named regions) describe the music in them? *(Very accurate / Somewhat accurate / Not accurate)*

**Q6.** How many songs did you click on to explore their details? *(1-5 / 5-15 / 15+ / I lost count)*

**Q7.** Which parts of the song detail panel were most interesting? *(Checkboxes: Fun Fact, Mood/Theme Tags, Instruments, Musician Credits, Producer/Studio Info, Connections to Other Songs, Lyrics Preview, Sonic Character Bars, Sampling Info)*

### Section 3: Search & Filtering

**Q8.** Did you try the search bar? *(Yes / No)*

**Q9.** If yes, what did you search for? *(Open text)*

**Q10.** How relevant were the search results? *(Very relevant / Somewhat relevant / Not relevant / Didn't try)*

**Q11.** Did you try clicking on tags in the sidebar to filter the graph? *(Yes / No)*

### Section 4: Playback

**Q12.** Did you try playing songs? *(Yes / No)*

**Q13.** How was the playback experience? *(Open text)*

### Section 5: Overall Experience

**Q14.** What did you enjoy most about Resonant? *(Open text)*

**Q15.** What was the most confusing or frustrating part? *(Open text)*

**Q16.** What feature would you most want added? *(Open text)*

**Q17.** How likely are you to use Resonant again if it were available? *(Definitely / Probably / Maybe / Probably not / Definitely not)*

**Q18.** Would you recommend Resonant to a friend who loves music? *(Definitely / Probably / Maybe / Probably not / Definitely not)*

**Q19.** Rate the overall experience. *(1-5 stars)*

**Q20.** Anything else you want to share? *(Open text)*

---

## Analyzing Results

### After all sessions are complete:

**1. Rainbow Spreadsheet**
Create a spreadsheet with one column per tester and one row per observation/issue. Color-code by tester. Patterns that appear across 3+ testers are high-priority fixes.

**2. Issue Severity Scoring**
For each issue found, rate:
- **Frequency:** How many testers encountered it? (1/5 = rare, 5/5 = universal)
- **Impact:** Did it block the task, slow them down, or just annoy them?
- **Priority:** Frequency × Impact = priority score

**3. Key Metrics to Track**
- Task completion rate per task (what percentage succeeded?)
- Time to first meaningful interaction
- Which sidebar sections got the most attention?
- Search query types attempted
- Most common confusion points
- Most common delight moments
- Feature requests (ranked by frequency)

**4. Actionable Categories**
Sort findings into:
- **Fix now:** Blocking issues that prevent core functionality
- **Fix soon:** Confusion points that reduce the experience quality
- **Consider:** Feature requests and nice-to-haves
- **Validate later:** Issues only 1 tester had (might be individual, not systemic)

---

## Tester Communication Templates

### Initial Outreach

Subject: **Help me test a music discovery tool (15 min)**

> Hi [Name],
>
> I'm building a music visualization tool for my capstone project and I'd love your help testing it. It takes your music and creates an interactive map showing how all your songs relate to each other.
>
> Here's what I need from you:
>
> **Step 1 (5 min):** Send me a playlist of 50-100 of your favorite songs. You can:
> - Open Spotify, go to a playlist, Ctrl+A to select all, Ctrl+C to copy, and paste in a message to me
> - Or just write out songs one per line: "Artist - Song Title"
> - Or send me Apple Music playlist links
>
> **Step 2 (wait ~24 hours):** I'll process your songs and send you a personalized link.
>
> **Step 3 (15-20 min):** Explore your music map and tell me what you think.
>
> Interested?

### Sending Their Collection URL

Subject: **Your Resonant music map is ready!**

> Hi [Name],
>
> Your personalized music map is ready! Open this on a laptop/desktop (not phone):
>
> **[URL]**
>
> Quick guide:
> - Each circle is one of your songs — hover to see the name
> - Songs near each other sound similar
> - Colored regions show mood/genre clusters
> - Click any song to see its full story
> - Try the search bar — search by mood ("dreamy"), instruments ("saxophone"), or similarity ("similar to [song name]")
> - Click on tags in the sidebar to filter the whole graph
> - Use arrow keys to hop between nearby songs
> - Click "Play this song" to listen
>
> Explore for 15-20 minutes, then fill out this quick survey:
> **[SURVEY LINK]**
>
> Thanks for helping!