// Shared Resonance-shaped onboarding fixture.
//
// One realistic, fully-answered submission used by BOTH:
//   • scripts/e2e-onboarding.mjs   — the intake pipeline harness
//   • scripts/e2e-prompts-live.mjs — the live prompt-quality evaluation
//
// It is deliberately opinionated: a Moderate swearing level, a real banlist
// ("Journey. Bespoke. Unlock. Elevate."), verbatim 2am thoughts, a lowest
// point written as a scene with a place and a year, and named characters.
// Those specifics are what the prompt evaluation asserts on, so changing them
// means updating scripts/e2e-prompts-live.mjs too.
//
// Spans every input shape the form produces: plain text, textarea, a
// comma-joined checkbox group, a select, and both halves of split questions.

export const ANSWERS = {
  describe_yourself_3_words: "stubborn, curious, blunt",
  timezone: "Europe/London",
  instagram_url: "https://instagram.com/e2e-not-real",
  youtube_url: "",
  top_reels_urls: "not yet",
  posting_frequency: "Barely. Maybe twice a month when I remember.",
  content_performed_well: "Talking-head rants about bad form in the gym.",
  content_feels_easy: "Talking to camera about training.",
  content_feels_difficult: "Anything scripted. I sound like a robot.",
  products_services: "1:1 online coaching, GBP 200/mo. 12-week group, GBP 600.",
  current_monthly_revenue: "About GBP 3,200",
  how_people_find_you: "Word of mouth almost entirely. Nothing consistent.",
  platforms: "Instagram, YouTube",
  brand_snapshot: "1,400 followers, posting 18 months, feels like a wall.",
  what_makes_you_different: "I was the fat kid who got told to just eat less.",
  how_people_should_feel: "Like someone finally told them the truth.",
  success_definition: "Five qualified DMs a week and two calls booked.",
  what_inspired_business: "A doctor told me at 24 I'd be diabetic by 35.",
  deeper_driver: "I refuse to be the dad who can't run around with his kid.",
  discomforts_running_from: "Being skint. Counting coins at the self-checkout.",
  ideal_life: "Train at 6, coach til 1, school run, no laptop after five.",
  key_life_moments: "Dad's heart attack. Dropping out. First paying client.",
  origin_story: "Worked in a warehouse, hated it, started training people.",
  lowest_point: "Sat in the car outside Tesco, 2019, couldn't afford the shop.",
  what_shifted: "A client texted me a photo of her deadlifting her bodyweight.",
  industry_hates: "Coaches selling 12-week shreds to people who need therapy.",
  contrarian_beliefs: "Most people don't need a plan. They need to stop quitting.",
  unique_approach: "I coach the week, not the workout.",
  known_for: "The one who tells you what you don't want to hear.",
  core_values: "Honesty, because I was lied to. Consistency, because I wasn't.",
  ideal_client: "35, two kids, desk job, trained before, stopped after the second.",
  client_struggles: "They cannot stay consistent past week three.",
  client_2am_thoughts: "\"I've let myself go.\" \"I used to be fit.\"",
  client_goals_desires: "To fit the suit from their wedding. To not be knackered.",
  not_your_client: "Anyone chasing a six-week transformation photo.",
  client_wins: "Sarah, 22kg in 11 months. Dave, off blood pressure meds in 7.",
  best_transformation_story: "Sarah came to me after her third failed diet...",
  testimonials: "Two written, on my highlights. No video yet.",
  creators_brands_inspire: "Alan Thrall — he'll say when he's wrong.",
  creators_that_cringe: "The shirtless-in-a-Lambo lot. Fake urgency.",
  how_you_talk: "Blunt, dry, a lot of analogies about cars and building sites.",
  swearing_level: "Moderate (shit, arse)",
  speech_examples: "\"That's a load of shite, mate.\" \"Right, listen.\"",
  catchphrases: "\"Right, listen.\" \"Here's the thing.\" \"Nae bother.\"",
  words_never_say: "Journey. Bespoke. Unlock. Elevate. Anything with 'crush it'.",
  characters_in_world: "Claire (wife), wee Rab (son), Big Tam at the gym.",
  interests_hobbies: "Restoring an old Escort. Watching Hibs lose.",
  old_self_vs_new_self: "Old me apologised for taking up space. New me doesn't.",
  biggest_challenge: "I don't know what I'm actually meant to say.",
  fears_about_visibility: "People I went to school with seeing it and laughing.",
  mental_loop: "\"I should be posting but I've nothing worth saying.\"",
  content_creation_blockers: "Time, mostly. And I overthink every single one.",
  what_didnt_work: "Bought a course. Posted 30 days straight. Got nothing.",
  skills_to_improve: "Presence on camera. Sales. Not rambling.",
  top_three_goals: "5k followers, 10 coaching clients, GBP 6k/mo by Christmas.",
  fuck_you_goal: "A gym with my name on it, paid for outright, no debt.",
  breakthrough_win: "One month where clients come to me instead of me chasing.",
  most_nervous_about: "Putting this much of myself out there.",
  understand_about_you: "I'm not lazy. I've just never been shown how.",
};
