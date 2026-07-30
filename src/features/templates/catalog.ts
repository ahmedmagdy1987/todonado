// AUTO-GENERATED CONTENT — the "Start from a template" catalog.
// Plain typed data (no DB). Category sets were authored in parallel, then
// normalized + validated (unique ids, positive efforts, allow-listed icons).
// Safe to edit by hand; keep every task's effortMinutes meaningful — that's what
// makes the capacity meter useful the moment a template is applied.
import type { LucideIcon } from 'lucide-react'
import type { Template, TemplateCategory } from './types'
import { resolveTemplateIcon } from './icons'

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    "id": "daily",
    "label": "Daily routines",
    "icon": "Sun"
  },
  {
    "id": "work",
    "label": "Work & productivity",
    "icon": "Briefcase"
  },
  {
    "id": "home",
    "label": "Home & life admin",
    "icon": "Home"
  },
  {
    "id": "errands",
    "label": "Errands & shopping",
    "icon": "ShoppingCart"
  },
  {
    "id": "travel",
    "label": "Travel",
    "icon": "Plane"
  },
  {
    "id": "events",
    "label": "Events",
    "icon": "PartyPopper"
  },
  {
    "id": "health",
    "label": "Health & fitness",
    "icon": "Dumbbell"
  },
  {
    "id": "finance",
    "label": "Finance & admin",
    "icon": "Wallet"
  },
  {
    "id": "growth",
    "label": "Personal growth & career",
    "icon": "GraduationCap"
  },
  {
    "id": "students",
    "label": "Students",
    "icon": "BookOpen"
  },
  {
    "id": "beginnings",
    "label": "New beginnings",
    "icon": "Sparkles"
  },
  {
    "id": "seasonal",
    "label": "Seasonal",
    "icon": "Leaf"
  },
  {
    "id": "checklists",
    "label": "Routines & Checklists",
    "icon": "ClipboardCheck"
  }
]

export const TEMPLATES: Template[] = [
  {
    "id": "daily-morning-routine",
    "title": "Morning Routine",
    "description": "Start the day grounded and ready before the first meeting hits.",
    "category": "daily",
    "icon": "Sunrise",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Make the bed and open the blinds",
        "effortMinutes": 5
      },
      {
        "title": "Drink a full glass of water",
        "effortMinutes": 5
      },
      {
        "title": "Shower and get dressed",
        "effortMinutes": 20
      },
      {
        "title": "Eat breakfast",
        "effortMinutes": 20
      },
      {
        "title": "Light movement or a short stretch",
        "effortMinutes": 15,
        "note": "Walk, stretch, or quick workout — whatever fits today."
      },
      {
        "title": "Review today's calendar and top 3 priorities",
        "effortMinutes": 10
      },
      {
        "title": "Tidy the kitchen and load the dishwasher",
        "effortMinutes": 10
      },
      {
        "title": "Pack bag, keys, and anything needed for the day",
        "effortMinutes": 10
      }
    ]
  },
  {
    "id": "daily-evening-wind-down",
    "title": "Evening Wind-Down",
    "description": "Close the day calmly and set tomorrow up to run itself.",
    "category": "daily",
    "icon": "Moon",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Tidy living spaces and put items back where they belong",
        "effortMinutes": 15
      },
      {
        "title": "Clean up the kitchen and wipe counters",
        "effortMinutes": 15
      },
      {
        "title": "Lay out clothes and prep anything for tomorrow",
        "effortMinutes": 10
      },
      {
        "title": "Review tomorrow's calendar and to-do list",
        "effortMinutes": 10
      },
      {
        "title": "Set out breakfast or pack lunch",
        "effortMinutes": 10
      },
      {
        "title": "Plug in and charge devices",
        "effortMinutes": 5
      },
      {
        "title": "Put phone on charge away from the bed",
        "effortMinutes": 5,
        "note": "Screens off ideally 30-60 min before sleep."
      },
      {
        "title": "Skincare and brush teeth",
        "effortMinutes": 15
      },
      {
        "title": "Read or unwind quietly before sleep",
        "effortMinutes": 20
      }
    ]
  },
  {
    "id": "daily-deep-work-day",
    "title": "Deep Work Day",
    "description": "Protect long focus blocks and finish the work that actually matters.",
    "category": "daily",
    "icon": "Brain",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Pick the single most important outcome for today",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Silence notifications and close distracting tabs and apps",
        "effortMinutes": 5,
        "section": "Set up"
      },
      {
        "title": "Block focus time on the calendar and set status to busy",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Gather everything needed: files, notes, water, snack",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Deep work block 1",
        "effortMinutes": 90,
        "section": "Focus",
        "note": "Single task only — no email, no chat."
      },
      {
        "title": "Movement and screen break",
        "effortMinutes": 15,
        "section": "Focus"
      },
      {
        "title": "Deep work block 2",
        "effortMinutes": 90,
        "section": "Focus"
      },
      {
        "title": "Lunch away from the desk",
        "effortMinutes": 30,
        "section": "Focus"
      },
      {
        "title": "Process inbox and messages in one batch",
        "effortMinutes": 30,
        "section": "Wrap up"
      },
      {
        "title": "Write tomorrow's first task and note where you stopped",
        "effortMinutes": 10,
        "section": "Wrap up"
      }
    ]
  },
  {
    "id": "daily-weekly-reset",
    "title": "Weekly Reset",
    "description": "Reset home, calendar, and plans so the week starts clean.",
    "category": "daily",
    "icon": "CalendarCheck",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Review last week: wins, leftovers, and what to drop",
        "effortMinutes": 20,
        "section": "Review"
      },
      {
        "title": "Clear and organize all inboxes to zero",
        "effortMinutes": 30,
        "section": "Review"
      },
      {
        "title": "Look over the week ahead and confirm appointments",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Set top 3 priorities for the week",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Plan meals and build a grocery list",
        "effortMinutes": 25,
        "section": "Plan"
      },
      {
        "title": "Run laundry and put it away",
        "effortMinutes": 45,
        "section": "Home"
      },
      {
        "title": "Tidy and reset main living areas",
        "effortMinutes": 30,
        "section": "Home"
      },
      {
        "title": "Quick clean: bathrooms and kitchen",
        "effortMinutes": 30,
        "section": "Home"
      },
      {
        "title": "Take out trash and recycling",
        "effortMinutes": 10,
        "section": "Home"
      },
      {
        "title": "Review budget and any bills due this week",
        "effortMinutes": 20,
        "section": "Admin"
      }
    ]
  },
  {
    "id": "daily-workday-shutdown",
    "title": "Workday Shutdown",
    "description": "End the workday on purpose so you can actually log off.",
    "category": "daily",
    "icon": "Briefcase",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Update task list and mark what got done",
        "effortMinutes": 10
      },
      {
        "title": "Do a final pass on email and urgent messages",
        "effortMinutes": 15
      },
      {
        "title": "Note progress and next step on each open project",
        "effortMinutes": 15
      },
      {
        "title": "Choose tomorrow's top 3 tasks",
        "effortMinutes": 10
      },
      {
        "title": "Skim tomorrow's calendar and prep for the first meeting",
        "effortMinutes": 10
      },
      {
        "title": "Close work apps, tabs, and documents",
        "effortMinutes": 5
      },
      {
        "title": "Tidy the desk and physical workspace",
        "effortMinutes": 10
      },
      {
        "title": "Say a clear shutdown phrase and step away",
        "effortMinutes": 5,
        "note": "A consistent cue signals your brain the workday is over."
      }
    ]
  },
  {
    "id": "work-weekly-review",
    "title": "Weekly Review",
    "description": "Close out the week, clear your inbox to zero, and plan the next five days with intent.",
    "category": "work",
    "icon": "CalendarCheck",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Review last week's calendar and note what actually got done",
        "effortMinutes": 15,
        "section": "Reflect"
      },
      {
        "title": "List wins and what slipped, with one lesson from each",
        "effortMinutes": 15,
        "section": "Reflect"
      },
      {
        "title": "Process email inbox to zero (archive, delegate, or task it)",
        "effortMinutes": 30,
        "section": "Clear",
        "note": "Decide on every message once; don't re-read."
      },
      {
        "title": "Empty notes app, voice memos, and scratch lists into your task system",
        "effortMinutes": 20,
        "section": "Clear"
      },
      {
        "title": "Review open tasks and mark done, defer, or drop",
        "effortMinutes": 20,
        "section": "Clear"
      },
      {
        "title": "Pick the 3 most important outcomes for next week",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Time-block deep-work sessions on the calendar",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Check upcoming deadlines and prep anything due Monday",
        "effortMinutes": 15,
        "section": "Plan"
      }
    ]
  },
  {
    "id": "work-project-kickoff",
    "title": "Project Kickoff",
    "description": "Stand up a new project with clear scope, roles, and a plan everyone agrees on.",
    "category": "work",
    "icon": "Rocket",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Write a one-page project brief: goal, scope, and success metrics",
        "effortMinutes": 45,
        "section": "Define"
      },
      {
        "title": "List what's explicitly out of scope to prevent creep",
        "effortMinutes": 15,
        "section": "Define"
      },
      {
        "title": "Identify stakeholders and assign a single owner per workstream",
        "effortMinutes": 20,
        "section": "Define"
      },
      {
        "title": "Draft milestones and a realistic timeline with buffer",
        "effortMinutes": 40,
        "section": "Plan"
      },
      {
        "title": "List key risks and a mitigation for each",
        "effortMinutes": 25,
        "section": "Plan"
      },
      {
        "title": "Confirm budget, tools, and resource needs",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Set up the shared workspace, channel, and document folder",
        "effortMinutes": 25,
        "section": "Launch"
      },
      {
        "title": "Schedule the kickoff meeting and send the agenda in advance",
        "effortMinutes": 20,
        "section": "Launch"
      },
      {
        "title": "Run the kickoff and capture decisions and action items",
        "effortMinutes": 60,
        "section": "Launch"
      }
    ]
  },
  {
    "id": "work-product-launch",
    "title": "Product Launch",
    "description": "Coordinate everything from final QA to go-live announcement so launch day runs clean.",
    "category": "work",
    "icon": "Zap",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Confirm the launch date and lock the cross-team timeline",
        "effortMinutes": 30,
        "section": "Pre-launch"
      },
      {
        "title": "Finish QA pass and sign off on the release checklist",
        "effortMinutes": 90,
        "section": "Pre-launch"
      },
      {
        "title": "Finalize pricing, packaging, and the landing page copy",
        "effortMinutes": 60,
        "section": "Pre-launch"
      },
      {
        "title": "Prepare launch announcement, email, and social posts",
        "effortMinutes": 60,
        "section": "Pre-launch"
      },
      {
        "title": "Brief support and sales with FAQs and talking points",
        "effortMinutes": 45,
        "section": "Pre-launch"
      },
      {
        "title": "Set up analytics, tracking, and success dashboards",
        "effortMinutes": 40,
        "section": "Pre-launch"
      },
      {
        "title": "Deploy or publish and verify everything is live",
        "effortMinutes": 30,
        "section": "Launch day"
      },
      {
        "title": "Send the announcement and push the social posts",
        "effortMinutes": 20,
        "section": "Launch day"
      },
      {
        "title": "Monitor errors, traffic, and early feedback",
        "effortMinutes": 60,
        "section": "Launch day"
      },
      {
        "title": "Hold a launch retro and log what to improve next time",
        "effortMinutes": 45,
        "section": "After"
      }
    ]
  },
  {
    "id": "work-sprint-planning",
    "title": "Sprint Planning",
    "description": "Run a focused planning session and leave with a committed, achievable sprint backlog.",
    "category": "work",
    "icon": "Target",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Review and groom the backlog before the meeting",
        "effortMinutes": 30,
        "section": "Prep"
      },
      {
        "title": "Confirm team capacity and account for PTO and meetings",
        "effortMinutes": 15,
        "section": "Prep"
      },
      {
        "title": "Carry over and reassess unfinished items from last sprint",
        "effortMinutes": 20,
        "section": "Prep"
      },
      {
        "title": "Set a clear, single sprint goal",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Prioritize candidate stories against the sprint goal",
        "effortMinutes": 25,
        "section": "Plan"
      },
      {
        "title": "Clarify acceptance criteria on each selected story",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Estimate stories and confirm they fit capacity",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Commit the sprint backlog and assign initial owners",
        "effortMinutes": 15,
        "section": "Wrap"
      },
      {
        "title": "Update the board and post the sprint goal to the team",
        "effortMinutes": 15,
        "section": "Wrap"
      }
    ]
  },
  {
    "id": "work-client-onboarding",
    "title": "Client Onboarding",
    "description": "Give every new client a smooth, professional start that sets expectations early.",
    "category": "work",
    "icon": "UserPlus",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Send the welcome email and signed agreement copy",
        "effortMinutes": 20,
        "section": "Setup"
      },
      {
        "title": "Collect intake info, access, and assets you need to start",
        "effortMinutes": 30,
        "section": "Setup"
      },
      {
        "title": "Create the client folder, project space, and contact record",
        "effortMinutes": 25,
        "section": "Setup"
      },
      {
        "title": "Set up invoicing and confirm billing details",
        "effortMinutes": 20,
        "section": "Setup"
      },
      {
        "title": "Schedule and run the kickoff call",
        "effortMinutes": 60,
        "section": "Align"
      },
      {
        "title": "Confirm goals, scope, deliverables, and timeline in writing",
        "effortMinutes": 30,
        "section": "Align"
      },
      {
        "title": "Agree on communication cadence and primary points of contact",
        "effortMinutes": 15,
        "section": "Align"
      },
      {
        "title": "Share the project plan and first milestone dates",
        "effortMinutes": 25,
        "section": "Handoff"
      },
      {
        "title": "Send a recap with next steps and what you need from them",
        "effortMinutes": 20,
        "section": "Handoff"
      }
    ]
  },
  {
    "id": "work-meeting-prep",
    "title": "Meeting Prep",
    "description": "Walk into any meeting prepared so it stays short, focused, and decision-driven.",
    "category": "work",
    "icon": "ClipboardList",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Define the meeting's purpose and the decision you need",
        "effortMinutes": 10
      },
      {
        "title": "Confirm the right attendees and remove anyone optional",
        "effortMinutes": 10
      },
      {
        "title": "Draft and send a timed agenda ahead of time",
        "effortMinutes": 15,
        "note": "Share at least a day early so people can prepare."
      },
      {
        "title": "Gather supporting data, docs, and links into one place",
        "effortMinutes": 20
      },
      {
        "title": "Review notes and action items from the last meeting",
        "effortMinutes": 10
      },
      {
        "title": "Prepare your key talking points and questions",
        "effortMinutes": 15
      },
      {
        "title": "Test the call link, screen share, and any slides",
        "effortMinutes": 10
      },
      {
        "title": "Assign a note-taker and a timekeeper",
        "effortMinutes": 5
      }
    ]
  },
  {
    "id": "work-end-of-quarter-close",
    "title": "End-of-Quarter Close",
    "description": "Wrap the quarter cleanly: reconcile the numbers, report results, and reset goals.",
    "category": "work",
    "icon": "CalendarDays",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Confirm all invoices are sent and payments recorded",
        "effortMinutes": 45,
        "section": "Reconcile"
      },
      {
        "title": "Reconcile accounts and categorize outstanding expenses",
        "effortMinutes": 60,
        "section": "Reconcile"
      },
      {
        "title": "Chase overdue payments and outstanding receipts",
        "effortMinutes": 30,
        "section": "Reconcile"
      },
      {
        "title": "Compare results against the quarter's goals and KPIs",
        "effortMinutes": 45,
        "section": "Review"
      },
      {
        "title": "Pull key metrics into a quarter-summary report",
        "effortMinutes": 60,
        "section": "Review"
      },
      {
        "title": "Note what worked, what missed, and why",
        "effortMinutes": 30,
        "section": "Review"
      },
      {
        "title": "Share the quarter recap with stakeholders or the team",
        "effortMinutes": 30,
        "section": "Report"
      },
      {
        "title": "Set goals and priorities for next quarter",
        "effortMinutes": 45,
        "section": "Plan ahead"
      },
      {
        "title": "Archive completed files and tidy the workspace",
        "effortMinutes": 25,
        "section": "Plan ahead"
      }
    ]
  },
  {
    "id": "home-move-to-new-home",
    "title": "Move to a New Home",
    "description": "Plan, pack, and settle a household move from notice to first night in the new place.",
    "category": "home",
    "icon": "Truck",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Confirm move date and book movers or rental truck",
        "effortMinutes": 45,
        "section": "4-6 weeks out",
        "note": "Compare 2-3 quotes before booking."
      },
      {
        "title": "Give notice to landlord or schedule closing details",
        "effortMinutes": 20,
        "section": "4-6 weeks out"
      },
      {
        "title": "Sort belongings and decide what to keep, donate, or toss",
        "effortMinutes": 120,
        "section": "4-6 weeks out"
      },
      {
        "title": "Order packing supplies: boxes, tape, bubble wrap, labels",
        "effortMinutes": 20,
        "section": "4-6 weeks out"
      },
      {
        "title": "Submit change of address with postal service and key accounts",
        "effortMinutes": 30,
        "section": "2 weeks out"
      },
      {
        "title": "Schedule utility transfers: electricity, gas, water, internet",
        "effortMinutes": 45,
        "section": "2 weeks out"
      },
      {
        "title": "Pack non-essential rooms and label boxes by room",
        "effortMinutes": 180,
        "section": "2 weeks out"
      },
      {
        "title": "Pack an essentials box for the first night",
        "effortMinutes": 30,
        "section": "Moving week",
        "note": "Toiletries, chargers, snacks, a change of clothes."
      },
      {
        "title": "Defrost the fridge and finish using or tossing food",
        "effortMinutes": 30,
        "section": "Moving week"
      },
      {
        "title": "Do a final walkthrough and photograph each empty room",
        "effortMinutes": 30,
        "section": "Moving day"
      },
      {
        "title": "Hand off or collect keys and read utility meters",
        "effortMinutes": 20,
        "section": "Moving day"
      },
      {
        "title": "Unpack essentials and set up beds in the new home",
        "effortMinutes": 90,
        "section": "After"
      },
      {
        "title": "Test smoke detectors and locate the breaker and water shutoff",
        "effortMinutes": 20,
        "section": "After"
      }
    ]
  },
  {
    "id": "home-deep-clean",
    "title": "Whole-Home Deep Clean",
    "description": "Top-to-bottom cleaning of every room, room by room, in an efficient order.",
    "category": "home",
    "icon": "Sparkles",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Gather supplies and declutter surfaces in each room",
        "effortMinutes": 30,
        "note": "Clearing first makes every later step faster."
      },
      {
        "title": "Dust ceiling corners, light fixtures, and ceiling fans",
        "effortMinutes": 25
      },
      {
        "title": "Wipe down walls, doors, and switch plates",
        "effortMinutes": 30
      },
      {
        "title": "Clean windows, sills, and tracks",
        "effortMinutes": 40
      },
      {
        "title": "Deep clean the kitchen: appliances, cabinets, and counters",
        "effortMinutes": 60
      },
      {
        "title": "Scrub the sink, stovetop, and inside the microwave",
        "effortMinutes": 30
      },
      {
        "title": "Deep clean bathrooms: tub, shower, toilet, and tile",
        "effortMinutes": 50
      },
      {
        "title": "Dust and polish furniture and baseboards throughout",
        "effortMinutes": 35
      },
      {
        "title": "Wash bedding and flip or rotate mattresses",
        "effortMinutes": 30
      },
      {
        "title": "Vacuum carpets, rugs, and upholstery",
        "effortMinutes": 35
      },
      {
        "title": "Mop all hard floors",
        "effortMinutes": 30
      },
      {
        "title": "Empty all trash bins and replace liners",
        "effortMinutes": 15
      }
    ]
  },
  {
    "id": "home-weekly-chores",
    "title": "Weekly Chores Reset",
    "description": "A repeatable Saturday routine that keeps the whole home tidy in one session.",
    "category": "home",
    "icon": "ListChecks",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Tidy and put away clutter in every room",
        "effortMinutes": 25
      },
      {
        "title": "Strip beds and start the first laundry load",
        "effortMinutes": 15
      },
      {
        "title": "Wipe kitchen counters, stovetop, and sink",
        "effortMinutes": 20
      },
      {
        "title": "Clean bathroom sinks, toilets, and mirrors",
        "effortMinutes": 25
      },
      {
        "title": "Dust surfaces and electronics",
        "effortMinutes": 20
      },
      {
        "title": "Vacuum floors and high-traffic rugs",
        "effortMinutes": 25
      },
      {
        "title": "Mop kitchen and bathroom floors",
        "effortMinutes": 20
      },
      {
        "title": "Empty all trash and recycling bins",
        "effortMinutes": 10
      },
      {
        "title": "Fold, hang, and put away laundry",
        "effortMinutes": 30
      },
      {
        "title": "Wipe down the fridge and toss expired food",
        "effortMinutes": 15
      }
    ]
  },
  {
    "id": "home-declutter",
    "title": "Room-by-Room Declutter",
    "description": "Clear out excess one zone at a time and route items to keep, donate, sell, or trash.",
    "category": "home",
    "icon": "Trash2",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Set up four bins: keep, donate, sell, trash",
        "effortMinutes": 10
      },
      {
        "title": "Declutter the entryway and drop zone",
        "effortMinutes": 25
      },
      {
        "title": "Clear kitchen counters, drawers, and pantry",
        "effortMinutes": 60
      },
      {
        "title": "Sort the closet and try on questionable clothing",
        "effortMinutes": 60,
        "note": "If you haven't worn it in a year, reconsider keeping it."
      },
      {
        "title": "Declutter the bathroom and discard expired products",
        "effortMinutes": 30
      },
      {
        "title": "Clear flat surfaces and shelves in the living room",
        "effortMinutes": 30
      },
      {
        "title": "Sort paperwork and shred sensitive documents",
        "effortMinutes": 45
      },
      {
        "title": "Tackle one junk drawer or storage bin",
        "effortMinutes": 20
      },
      {
        "title": "Bag donations and schedule drop-off or pickup",
        "effortMinutes": 20
      },
      {
        "title": "List sellable items online and take photos",
        "effortMinutes": 30
      },
      {
        "title": "Take out the trash and recycling",
        "effortMinutes": 10
      }
    ]
  },
  {
    "id": "home-car-maintenance",
    "title": "Car Maintenance Check",
    "description": "A routine inspection and service round to keep your vehicle safe and running well.",
    "category": "home",
    "icon": "Car",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Check the owner's manual for the recommended service interval",
        "effortMinutes": 10
      },
      {
        "title": "Inspect tire tread and set pressure to the recommended PSI",
        "effortMinutes": 20
      },
      {
        "title": "Check engine oil level and look for an overdue oil change",
        "effortMinutes": 15
      },
      {
        "title": "Top off washer fluid, coolant, and brake fluid",
        "effortMinutes": 20
      },
      {
        "title": "Test all exterior lights and turn signals",
        "effortMinutes": 10
      },
      {
        "title": "Replace wiper blades if streaking or worn",
        "effortMinutes": 15
      },
      {
        "title": "Inspect the air filter and replace if dirty",
        "effortMinutes": 20
      },
      {
        "title": "Check battery terminals for corrosion",
        "effortMinutes": 10
      },
      {
        "title": "Book an oil change or service appointment if due",
        "effortMinutes": 15
      },
      {
        "title": "Confirm registration and insurance are current",
        "effortMinutes": 15
      },
      {
        "title": "Wash the exterior and vacuum the interior",
        "effortMinutes": 45
      }
    ]
  },
  {
    "id": "errands-grocery-run",
    "title": "Grocery Run",
    "description": "Plan, shop, and put away a full week's groceries without backtracking the store.",
    "category": "errands",
    "icon": "ShoppingCart",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "Check fridge, freezer, and pantry for what's running low",
        "effortMinutes": 10,
        "section": "Plan"
      },
      {
        "title": "Plan meals for the week and build the shopping list",
        "effortMinutes": 15,
        "section": "Plan",
        "note": "Group items by store section to speed up the trip."
      },
      {
        "title": "Check for coupons, store app deals, and loyalty offers",
        "effortMinutes": 10,
        "section": "Plan"
      },
      {
        "title": "Bring reusable bags and a cooler bag for cold items",
        "effortMinutes": 5,
        "section": "Plan"
      },
      {
        "title": "Drive to the store and park",
        "effortMinutes": 15,
        "section": "Shop"
      },
      {
        "title": "Shop produce, then pantry and dry goods",
        "effortMinutes": 20,
        "section": "Shop"
      },
      {
        "title": "Grab refrigerated and frozen items last",
        "effortMinutes": 10,
        "section": "Shop",
        "note": "Keeps cold items cold until checkout."
      },
      {
        "title": "Check out, scan loyalty card, and pay",
        "effortMinutes": 10,
        "section": "Shop"
      },
      {
        "title": "Load groceries and drive home",
        "effortMinutes": 15,
        "section": "After"
      },
      {
        "title": "Unload and put away groceries, fridge and freezer first",
        "effortMinutes": 15,
        "section": "After"
      }
    ]
  },
  {
    "id": "errands-pharmacy-run",
    "title": "Pharmacy Run",
    "description": "Pick up prescriptions and restock everyday health and personal-care basics.",
    "category": "errands",
    "icon": "Pill",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "Check which prescriptions need refilling or renewing",
        "effortMinutes": 10
      },
      {
        "title": "Request refills through the pharmacy app or phone",
        "effortMinutes": 10,
        "note": "Confirm they're ready before you go to avoid a wait."
      },
      {
        "title": "Make a list of toiletries and first-aid items to restock",
        "effortMinutes": 10
      },
      {
        "title": "Bring ID, insurance card, and payment method",
        "effortMinutes": 5
      },
      {
        "title": "Drive to the pharmacy and park",
        "effortMinutes": 15
      },
      {
        "title": "Pick up prescriptions at the counter",
        "effortMinutes": 15
      },
      {
        "title": "Grab toiletries, vitamins, and household health items",
        "effortMinutes": 15
      },
      {
        "title": "Check out and pay",
        "effortMinutes": 10
      },
      {
        "title": "Drive home and store medications properly",
        "effortMinutes": 15
      }
    ]
  },
  {
    "id": "errands-hardware-store",
    "title": "Hardware Store Trip",
    "description": "Gather everything for a home project in one trip so you don't have to go back.",
    "category": "errands",
    "icon": "Wrench",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "List the project and every part and material it needs",
        "effortMinutes": 15,
        "section": "Before you go"
      },
      {
        "title": "Measure spaces, openings, and quantities you'll buy",
        "effortMinutes": 15,
        "section": "Before you go",
        "note": "Photos and measurements prevent guesswork at the shelf."
      },
      {
        "title": "Check what tools and supplies you already own",
        "effortMinutes": 10,
        "section": "Before you go"
      },
      {
        "title": "Find sample, broken part, or model number to match",
        "effortMinutes": 10,
        "section": "Before you go"
      },
      {
        "title": "Drive to the store and grab a cart",
        "effortMinutes": 15,
        "section": "At the store"
      },
      {
        "title": "Locate aisles and gather materials on the list",
        "effortMinutes": 25,
        "section": "At the store"
      },
      {
        "title": "Ask staff for help matching parts or sizing",
        "effortMinutes": 10,
        "section": "At the store"
      },
      {
        "title": "Pick up extra fasteners, tape, and consumables",
        "effortMinutes": 10,
        "section": "At the store"
      },
      {
        "title": "Check out and pay",
        "effortMinutes": 10,
        "section": "At the store"
      },
      {
        "title": "Load up, drive home, and lay out materials for the project",
        "effortMinutes": 20,
        "section": "After"
      }
    ]
  },
  {
    "id": "errands-weekly-errands",
    "title": "Weekly Errands Circuit",
    "description": "Batch the week's stops into one efficient loop and knock them all out.",
    "category": "errands",
    "icon": "Car",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "List every stop and what you need at each",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Order stops into the most efficient route",
        "effortMinutes": 10,
        "section": "Plan",
        "note": "Save cold and frozen purchases for the last leg."
      },
      {
        "title": "Gather returns, dry cleaning, bags, and mail-outs",
        "effortMinutes": 10,
        "section": "Plan"
      },
      {
        "title": "Drop off packages or mail at the post office",
        "effortMinutes": 20,
        "section": "Run"
      },
      {
        "title": "Stop at the bank or ATM",
        "effortMinutes": 15,
        "section": "Run"
      },
      {
        "title": "Pick up or drop off dry cleaning",
        "effortMinutes": 15,
        "section": "Run"
      },
      {
        "title": "Fill up the gas tank",
        "effortMinutes": 10,
        "section": "Run"
      },
      {
        "title": "Do the grocery shop",
        "effortMinutes": 40,
        "section": "Run"
      },
      {
        "title": "Drive home and unload everything",
        "effortMinutes": 15,
        "section": "Wrap up"
      },
      {
        "title": "Sort mail and file receipts",
        "effortMinutes": 10,
        "section": "Wrap up"
      }
    ]
  },
  {
    "id": "travel-trip-packing",
    "title": "Trip Packing Checklist",
    "description": "Pack a carry-on and checked bag for a multi-day trip without forgetting essentials.",
    "category": "travel",
    "icon": "Luggage",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Check the destination weather forecast for your travel dates",
        "effortMinutes": 10,
        "section": "Plan",
        "note": "Lets you pack the right layers and rain gear."
      },
      {
        "title": "Make a packing list by category: clothes, toiletries, tech, documents",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Confirm airline baggage size and weight limits",
        "effortMinutes": 10,
        "section": "Plan"
      },
      {
        "title": "Lay out outfits per day plus one spare set",
        "effortMinutes": 25,
        "section": "Pack"
      },
      {
        "title": "Pack toiletries in travel-size containers and a sealable bag",
        "effortMinutes": 20,
        "section": "Pack",
        "note": "Keep liquids under carry-on limits if not checking a bag."
      },
      {
        "title": "Gather chargers, adapters, power bank, and headphones",
        "effortMinutes": 15,
        "section": "Pack"
      },
      {
        "title": "Pack any daily essentials and a small first-aid kit",
        "effortMinutes": 15,
        "section": "Pack"
      },
      {
        "title": "Put passport, ID, tickets, and reservations in one accessible pouch",
        "effortMinutes": 15,
        "section": "Documents"
      },
      {
        "title": "Save digital copies of key documents to your phone and cloud",
        "effortMinutes": 15,
        "section": "Documents"
      },
      {
        "title": "Set aside a carry-on with valuables, meds, and a change of clothes",
        "effortMinutes": 15,
        "section": "Pack"
      },
      {
        "title": "Weigh each bag and redistribute to avoid overage fees",
        "effortMinutes": 10,
        "section": "Final"
      },
      {
        "title": "Do a final sweep against the list and check chargers near outlets",
        "effortMinutes": 10,
        "section": "Final"
      }
    ]
  },
  {
    "id": "travel-travel-planning",
    "title": "Trip Planning",
    "description": "Plan a trip end to end, from budget and bookings to a day-by-day itinerary.",
    "category": "travel",
    "icon": "Map",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Set trip dates, destination, and overall budget",
        "effortMinutes": 30,
        "section": "Decide"
      },
      {
        "title": "Research neighborhoods, must-see spots, and local transit",
        "effortMinutes": 45,
        "section": "Research"
      },
      {
        "title": "Compare and book flights or main transport",
        "effortMinutes": 40,
        "section": "Book"
      },
      {
        "title": "Book accommodation for the full stay",
        "effortMinutes": 35,
        "section": "Book"
      },
      {
        "title": "Reserve any tours, tickets, or restaurants that sell out",
        "effortMinutes": 30,
        "section": "Book",
        "note": "Popular attractions often need booking weeks ahead."
      },
      {
        "title": "Arrange airport transfers or a rental car",
        "effortMinutes": 25,
        "section": "Book"
      },
      {
        "title": "Check passport validity, visas, and entry requirements",
        "effortMinutes": 30,
        "section": "Prepare",
        "note": "Some countries require six months of passport validity."
      },
      {
        "title": "Notify your bank of travel and set up a payment method that works abroad",
        "effortMinutes": 15,
        "section": "Prepare"
      },
      {
        "title": "Buy travel insurance and download offline maps",
        "effortMinutes": 25,
        "section": "Prepare"
      },
      {
        "title": "Build a day-by-day itinerary with anchor activities",
        "effortMinutes": 45,
        "section": "Itinerary"
      },
      {
        "title": "Share the itinerary and key bookings with a trusted contact",
        "effortMinutes": 15,
        "section": "Itinerary"
      }
    ]
  },
  {
    "id": "travel-pre-flight-checklist",
    "title": "Pre-Flight Checklist",
    "description": "Everything to handle the day before and morning of a flight so check-in goes smoothly.",
    "category": "travel",
    "icon": "Plane",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Check in online and download your boarding pass",
        "effortMinutes": 15,
        "section": "Day before"
      },
      {
        "title": "Confirm flight time, terminal, and gate; check for delays",
        "effortMinutes": 10,
        "section": "Day before"
      },
      {
        "title": "Verify carry-on liquids and that no banned items are packed",
        "effortMinutes": 15,
        "section": "Day before"
      },
      {
        "title": "Charge phone, headphones, and power bank fully",
        "effortMinutes": 10,
        "section": "Day before",
        "note": "Power banks must go in carry-on, not checked luggage."
      },
      {
        "title": "Arrange transport to the airport and confirm timing",
        "effortMinutes": 15,
        "section": "Day before"
      },
      {
        "title": "Set an alarm to leave with time for security and boarding",
        "effortMinutes": 5,
        "section": "Day before"
      },
      {
        "title": "Pack passport or ID, boarding pass, and wallet in an easy-reach pocket",
        "effortMinutes": 10,
        "section": "Day of"
      },
      {
        "title": "Dress in airport-friendly layers and slip-on shoes",
        "effortMinutes": 10,
        "section": "Day of"
      },
      {
        "title": "Fill a reusable water bottle after security",
        "effortMinutes": 5,
        "section": "Day of"
      },
      {
        "title": "Confirm gate on the airport board and head over early",
        "effortMinutes": 10,
        "section": "Day of"
      }
    ]
  },
  {
    "id": "travel-business-trip",
    "title": "Business Trip Prep",
    "description": "Prepare for a work trip so meetings, expenses, and logistics are all covered.",
    "category": "travel",
    "icon": "Briefcase",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Confirm meeting schedule, locations, and attendees",
        "effortMinutes": 25,
        "section": "Plan"
      },
      {
        "title": "Book flights and hotel within company travel policy",
        "effortMinutes": 40,
        "section": "Book"
      },
      {
        "title": "Arrange ground transport between airport, hotel, and venues",
        "effortMinutes": 20,
        "section": "Book"
      },
      {
        "title": "Prepare and review presentation or meeting materials",
        "effortMinutes": 60,
        "section": "Prepare"
      },
      {
        "title": "Pack laptop, chargers, adapters, and presentation backup",
        "effortMinutes": 20,
        "section": "Prepare",
        "note": "Keep a copy of slides in the cloud in case of device issues."
      },
      {
        "title": "Pack business attire pressed and a backup outfit",
        "effortMinutes": 25,
        "section": "Prepare"
      },
      {
        "title": "Load digital copies of itinerary, bookings, and ID",
        "effortMinutes": 15,
        "section": "Prepare"
      },
      {
        "title": "Set an out-of-office message and brief your team on coverage",
        "effortMinutes": 20,
        "section": "Prepare"
      },
      {
        "title": "Bring business cards and any contracts or documents",
        "effortMinutes": 10,
        "section": "Prepare"
      },
      {
        "title": "Save receipts and start an expense log for reimbursement",
        "effortMinutes": 15,
        "section": "On trip"
      },
      {
        "title": "Send follow-up notes and submit your expense report after returning",
        "effortMinutes": 30,
        "section": "After"
      }
    ]
  },
  {
    "id": "travel-road-trip",
    "title": "Road Trip Prep",
    "description": "Get the car, route, and supplies ready for a safe and smooth road trip.",
    "category": "travel",
    "icon": "Car",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Plan the route with stops, fuel, and overnight points",
        "effortMinutes": 40,
        "section": "Plan"
      },
      {
        "title": "Download offline maps and a backup navigation app",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Book accommodations for overnight stops",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Check oil, coolant, tire pressure, and tread",
        "effortMinutes": 30,
        "section": "Vehicle",
        "note": "Top up fluids and inflate tires to the door-jamb spec."
      },
      {
        "title": "Confirm spare tire, jack, and roadside kit are in the car",
        "effortMinutes": 15,
        "section": "Vehicle"
      },
      {
        "title": "Get the car washed and fuel up the night before",
        "effortMinutes": 30,
        "section": "Vehicle"
      },
      {
        "title": "Pack snacks, water, and a cooler for the drive",
        "effortMinutes": 25,
        "section": "Supplies"
      },
      {
        "title": "Build a road-trip playlist and queue podcasts offline",
        "effortMinutes": 20,
        "section": "Supplies"
      },
      {
        "title": "Pack phone mount, car chargers, and a power bank",
        "effortMinutes": 10,
        "section": "Supplies"
      },
      {
        "title": "Bring license, insurance, registration, and emergency contacts",
        "effortMinutes": 10,
        "section": "Supplies"
      },
      {
        "title": "Pack a small first-aid kit, flashlight, and reusable bags for trash",
        "effortMinutes": 15,
        "section": "Supplies"
      }
    ]
  },
  {
    "id": "events-party-planning",
    "title": "Party Planning",
    "description": "Plan and run a casual house party from guest list to clean-up.",
    "category": "events",
    "icon": "PartyPopper",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Set the date, time, and party theme",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Decide on a budget and rough headcount",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Build the guest list and send invites",
        "effortMinutes": 30,
        "section": "Plan",
        "note": "Ask for RSVPs and any dietary needs."
      },
      {
        "title": "Plan the food and drinks menu",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Create a music playlist",
        "effortMinutes": 25,
        "section": "Plan"
      },
      {
        "title": "Buy decorations and party supplies",
        "effortMinutes": 45,
        "section": "Prep"
      },
      {
        "title": "Shop for food, drinks, and ice",
        "effortMinutes": 60,
        "section": "Prep"
      },
      {
        "title": "Deep clean and tidy the hosting space",
        "effortMinutes": 60,
        "section": "Prep"
      },
      {
        "title": "Set up decorations, seating, and lighting",
        "effortMinutes": 45,
        "section": "Day of"
      },
      {
        "title": "Prep snacks and chill the drinks",
        "effortMinutes": 40,
        "section": "Day of"
      },
      {
        "title": "Greet guests and start the music",
        "effortMinutes": 15,
        "section": "Day of"
      },
      {
        "title": "Clean up and take out the trash",
        "effortMinutes": 45,
        "section": "After"
      }
    ]
  },
  {
    "id": "events-dinner-party",
    "title": "Dinner Party",
    "description": "Host an elegant sit-down dinner with a planned menu and timing.",
    "category": "events",
    "icon": "Utensils",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Confirm guest count and dietary restrictions",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Design the menu: starter, main, sides, dessert",
        "effortMinutes": 40,
        "section": "Plan"
      },
      {
        "title": "Choose wine and non-alcoholic drink pairings",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Write the grocery list and prep timeline",
        "effortMinutes": 25,
        "section": "Plan",
        "note": "Note what can be made ahead."
      },
      {
        "title": "Shop for groceries and beverages",
        "effortMinutes": 60,
        "section": "Prep"
      },
      {
        "title": "Prep make-ahead dishes and sauces",
        "effortMinutes": 90,
        "section": "Prep"
      },
      {
        "title": "Set the table with linens, plates, and glassware",
        "effortMinutes": 30,
        "section": "Day of"
      },
      {
        "title": "Tidy the dining and common areas",
        "effortMinutes": 30,
        "section": "Day of"
      },
      {
        "title": "Cook the main course and sides",
        "effortMinutes": 90,
        "section": "Day of"
      },
      {
        "title": "Plate appetizers and pour welcome drinks",
        "effortMinutes": 20,
        "section": "Day of"
      },
      {
        "title": "Serve dinner course by course",
        "effortMinutes": 30,
        "section": "Day of"
      },
      {
        "title": "Wash dishes and put away leftovers",
        "effortMinutes": 45,
        "section": "After"
      }
    ]
  },
  {
    "id": "events-birthday",
    "title": "Birthday Party",
    "description": "Organize a memorable birthday celebration from invites to thank-yous.",
    "category": "events",
    "icon": "Cake",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Pick the date, venue, and party theme",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Set the budget and guest list",
        "effortMinutes": 25,
        "section": "Plan"
      },
      {
        "title": "Send invitations and track RSVPs",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Order or bake the birthday cake",
        "effortMinutes": 30,
        "section": "Plan",
        "note": "Confirm flavor and any allergies."
      },
      {
        "title": "Plan games, activities, or entertainment",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Buy decorations, balloons, and tableware",
        "effortMinutes": 45,
        "section": "Prep"
      },
      {
        "title": "Shop for food, snacks, and drinks",
        "effortMinutes": 60,
        "section": "Prep"
      },
      {
        "title": "Prepare party favors and goodie bags",
        "effortMinutes": 40,
        "section": "Prep"
      },
      {
        "title": "Decorate the space and set up the table",
        "effortMinutes": 60,
        "section": "Day of"
      },
      {
        "title": "Set out food and prepare the cake table",
        "effortMinutes": 30,
        "section": "Day of"
      },
      {
        "title": "Sing happy birthday and serve the cake",
        "effortMinutes": 20,
        "section": "Day of"
      },
      {
        "title": "Clean up and send thank-you notes",
        "effortMinutes": 40,
        "section": "After"
      }
    ]
  },
  {
    "id": "events-wedding-planning",
    "title": "Wedding Planning",
    "description": "Track the major milestones for planning a wedding day.",
    "category": "events",
    "icon": "Heart",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Set the wedding budget and overall vision",
        "effortMinutes": 60,
        "section": "Foundations"
      },
      {
        "title": "Draft the guest list and estimate headcount",
        "effortMinutes": 60,
        "section": "Foundations"
      },
      {
        "title": "Choose and book the ceremony and reception venue",
        "effortMinutes": 120,
        "section": "Book vendors"
      },
      {
        "title": "Book the caterer and arrange a tasting",
        "effortMinutes": 90,
        "section": "Book vendors"
      },
      {
        "title": "Hire the photographer and videographer",
        "effortMinutes": 90,
        "section": "Book vendors"
      },
      {
        "title": "Book music or DJ and florist",
        "effortMinutes": 90,
        "section": "Book vendors"
      },
      {
        "title": "Shop for wedding attire and schedule fittings",
        "effortMinutes": 120,
        "section": "Details"
      },
      {
        "title": "Send save-the-dates and design invitations",
        "effortMinutes": 90,
        "section": "Details"
      },
      {
        "title": "Mail invitations and set up RSVP tracking",
        "effortMinutes": 60,
        "section": "Details"
      },
      {
        "title": "Finalize seating chart and table assignments",
        "effortMinutes": 90,
        "section": "Final weeks"
      },
      {
        "title": "Confirm timeline and details with all vendors",
        "effortMinutes": 60,
        "section": "Final weeks"
      },
      {
        "title": "Arrange transportation and accommodations",
        "effortMinutes": 60,
        "section": "Final weeks"
      },
      {
        "title": "Apply for the marriage license",
        "effortMinutes": 45,
        "section": "Final weeks"
      },
      {
        "title": "Pack for the wedding day and assemble emergency kit",
        "effortMinutes": 45,
        "section": "Final weeks"
      }
    ]
  },
  {
    "id": "events-hosting-guests",
    "title": "Hosting Overnight Guests",
    "description": "Get your home ready for visitors staying over and make them feel welcome.",
    "category": "events",
    "icon": "Home",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Confirm arrival, departure, and travel plans",
        "effortMinutes": 20,
        "section": "Before they arrive"
      },
      {
        "title": "Ask about dietary needs and preferences",
        "effortMinutes": 15,
        "section": "Before they arrive"
      },
      {
        "title": "Deep clean the guest room and bathroom",
        "effortMinutes": 60,
        "section": "Before they arrive"
      },
      {
        "title": "Wash and set out fresh linens and towels",
        "effortMinutes": 40,
        "section": "Before they arrive"
      },
      {
        "title": "Stock the bathroom with toiletries and essentials",
        "effortMinutes": 25,
        "section": "Before they arrive"
      },
      {
        "title": "Grocery shop for meals, snacks, and drinks",
        "effortMinutes": 60,
        "section": "Before they arrive"
      },
      {
        "title": "Plan meals and a few local activity ideas",
        "effortMinutes": 30,
        "section": "Before they arrive"
      },
      {
        "title": "Set up Wi-Fi info and spare keys",
        "effortMinutes": 15,
        "section": "Before they arrive",
        "note": "Leave the network password where they can find it."
      },
      {
        "title": "Tidy shared living spaces",
        "effortMinutes": 30,
        "section": "Before they arrive"
      },
      {
        "title": "Greet guests and give a quick home tour",
        "effortMinutes": 20,
        "section": "During the stay"
      },
      {
        "title": "Strip beds and wash linens after they leave",
        "effortMinutes": 40,
        "section": "After"
      }
    ]
  },
  {
    "id": "health-workout-split",
    "title": "Weekly Workout Split Setup",
    "description": "Plan and run a balanced training week across muscle groups with built-in recovery.",
    "category": "health",
    "icon": "Dumbbell",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Pick your weekly split (e.g. push/pull/legs or upper/lower)",
        "effortMinutes": 15,
        "section": "Plan",
        "note": "Match training days to your real schedule."
      },
      {
        "title": "Block training days and rest days on your calendar",
        "effortMinutes": 10,
        "section": "Plan"
      },
      {
        "title": "List 4-6 main exercises per training day",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Set starting weights, sets, and rep targets",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Day 1 - warm up, complete session, log every set",
        "effortMinutes": 60,
        "section": "Train"
      },
      {
        "title": "Day 2 - warm up, complete session, log every set",
        "effortMinutes": 60,
        "section": "Train"
      },
      {
        "title": "Day 3 - warm up, complete session, log every set",
        "effortMinutes": 60,
        "section": "Train"
      },
      {
        "title": "Stretch and cool down after each session",
        "effortMinutes": 10,
        "section": "Train"
      },
      {
        "title": "Review the week's logs and note progress",
        "effortMinutes": 15,
        "section": "Review",
        "note": "Add weight or reps where last session felt easy."
      }
    ]
  },
  {
    "id": "health-meal-prep",
    "title": "Weekly Meal Prep",
    "description": "Plan, shop, and batch-cook a week of balanced meals in one organized session.",
    "category": "health",
    "icon": "ChefHat",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Plan breakfasts, lunches, and dinners for the week",
        "effortMinutes": 25,
        "section": "Plan"
      },
      {
        "title": "Check pantry, fridge, and freezer for what you have",
        "effortMinutes": 10,
        "section": "Plan"
      },
      {
        "title": "Build a grocery list grouped by store aisle",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Shop for ingredients",
        "effortMinutes": 45,
        "section": "Shop"
      },
      {
        "title": "Wash and chop vegetables for the week",
        "effortMinutes": 30,
        "section": "Cook"
      },
      {
        "title": "Cook proteins in batches",
        "effortMinutes": 45,
        "section": "Cook"
      },
      {
        "title": "Prepare grains, starches, and sauces",
        "effortMinutes": 30,
        "section": "Cook"
      },
      {
        "title": "Portion meals into containers and label with dates",
        "effortMinutes": 20,
        "section": "Pack"
      },
      {
        "title": "Store portions in fridge and freezer",
        "effortMinutes": 10,
        "section": "Pack"
      },
      {
        "title": "Clean kitchen and wash cookware",
        "effortMinutes": 20,
        "section": "Pack"
      }
    ]
  },
  {
    "id": "health-habit-kickstart",
    "title": "Healthy Habit Kickstart",
    "description": "Set up and run the first day of a new daily habit so it actually sticks.",
    "category": "health",
    "icon": "Sparkles",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Choose one specific habit to build this month",
        "effortMinutes": 15,
        "section": "Set up",
        "note": "Keep it small and concrete, e.g. a 10-minute walk."
      },
      {
        "title": "Define when, where, and how often you'll do it",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Attach the habit to an existing daily routine",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Set up a simple tracker or reminder",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Prepare anything you need to remove friction",
        "effortMinutes": 15,
        "section": "Set up",
        "note": "Lay out clothes, fill a water bottle, etc."
      },
      {
        "title": "Do the habit for the first time",
        "effortMinutes": 20,
        "section": "Do it"
      },
      {
        "title": "Mark it done and note how it felt",
        "effortMinutes": 5,
        "section": "Do it"
      },
      {
        "title": "Plan tomorrow's cue and remove one obstacle",
        "effortMinutes": 10,
        "section": "Do it"
      }
    ]
  },
  {
    "id": "health-home-workout",
    "title": "No-Equipment Home Workout",
    "description": "A full bodyweight session you can run at home with warm-up, circuits, and cooldown.",
    "category": "health",
    "icon": "HeartPulse",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Clear a workout space and fill a water bottle",
        "effortMinutes": 10,
        "section": "Prep"
      },
      {
        "title": "Dynamic warm-up - arm circles, leg swings, light cardio",
        "effortMinutes": 10,
        "section": "Warm up"
      },
      {
        "title": "Circuit 1 - squats and lunges",
        "effortMinutes": 10,
        "section": "Circuits"
      },
      {
        "title": "Circuit 2 - push-ups and dips",
        "effortMinutes": 10,
        "section": "Circuits"
      },
      {
        "title": "Circuit 3 - plank and core holds",
        "effortMinutes": 10,
        "section": "Circuits"
      },
      {
        "title": "Circuit 4 - glute bridges and calf raises",
        "effortMinutes": 10,
        "section": "Circuits"
      },
      {
        "title": "Cardio finisher - jumping jacks or high knees",
        "effortMinutes": 5,
        "section": "Finish"
      },
      {
        "title": "Cool down and stretch major muscle groups",
        "effortMinutes": 10,
        "section": "Finish"
      },
      {
        "title": "Log the session and how you felt",
        "effortMinutes": 5,
        "section": "Finish"
      }
    ]
  },
  {
    "id": "finance-monthly-budget-review",
    "title": "Monthly Budget Review",
    "description": "Reconcile last month's spending, adjust your budget, and set targets for the month ahead.",
    "category": "finance",
    "icon": "Wallet",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "Gather all account statements (checking, savings, credit cards)",
        "effortMinutes": 15,
        "section": "Pull the data",
        "note": "Download PDFs or export CSVs so you have everything in one place."
      },
      {
        "title": "Categorize last month's transactions",
        "effortMinutes": 45,
        "section": "Pull the data",
        "note": "Group into housing, food, transport, subscriptions, etc."
      },
      {
        "title": "Compare actual spending against budgeted amounts",
        "effortMinutes": 30,
        "section": "Review"
      },
      {
        "title": "Flag the top three overspending categories",
        "effortMinutes": 15,
        "section": "Review"
      },
      {
        "title": "Note any irregular or one-off expenses to exclude from trends",
        "effortMinutes": 10,
        "section": "Review"
      },
      {
        "title": "Confirm income received matches what was expected",
        "effortMinutes": 10,
        "section": "Review"
      },
      {
        "title": "Update category budgets for the coming month",
        "effortMinutes": 25,
        "section": "Plan ahead"
      },
      {
        "title": "Move any surplus into savings or a sinking fund",
        "effortMinutes": 15,
        "section": "Plan ahead"
      },
      {
        "title": "Set one spending goal for next month",
        "effortMinutes": 10,
        "section": "Plan ahead",
        "note": "Keep it specific and measurable."
      },
      {
        "title": "Schedule next month's review",
        "effortMinutes": 5,
        "section": "Plan ahead"
      }
    ]
  },
  {
    "id": "finance-tax-prep-checklist",
    "title": "Tax Prep Checklist",
    "description": "Gather documents, organize records, and get everything ready to file or hand to your preparer.",
    "category": "finance",
    "icon": "Receipt",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "Collect income statements (wages, freelance, investment)",
        "effortMinutes": 30,
        "section": "Gather documents"
      },
      {
        "title": "Collect interest and dividend statements",
        "effortMinutes": 20,
        "section": "Gather documents"
      },
      {
        "title": "Gather receipts for deductible expenses",
        "effortMinutes": 45,
        "section": "Gather documents",
        "note": "Sort by category to speed up entry later."
      },
      {
        "title": "Compile records for any charitable donations",
        "effortMinutes": 20,
        "section": "Gather documents"
      },
      {
        "title": "Pull last year's return for reference",
        "effortMinutes": 10,
        "section": "Gather documents"
      },
      {
        "title": "Confirm personal details and any dependents are current",
        "effortMinutes": 10,
        "section": "Organize"
      },
      {
        "title": "Reconcile totals against your own records",
        "effortMinutes": 40,
        "section": "Organize"
      },
      {
        "title": "Create a single folder (digital or physical) for all tax files",
        "effortMinutes": 20,
        "section": "Organize"
      },
      {
        "title": "Note any missing documents and request them",
        "effortMinutes": 15,
        "section": "Organize"
      },
      {
        "title": "Book an appointment or set aside time to file",
        "effortMinutes": 15,
        "section": "File"
      },
      {
        "title": "Review the completed return before submitting",
        "effortMinutes": 30,
        "section": "File"
      },
      {
        "title": "Save copies and confirmation of filing",
        "effortMinutes": 10,
        "section": "File"
      }
    ]
  },
  {
    "id": "finance-bill-payments",
    "title": "Bill Payments",
    "description": "Run through your recurring bills, pay what's due, and confirm nothing slips through the cracks.",
    "category": "finance",
    "icon": "CreditCard",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "List all bills due this period with amounts and dates",
        "effortMinutes": 20
      },
      {
        "title": "Check account balances before paying",
        "effortMinutes": 10
      },
      {
        "title": "Pay rent or mortgage",
        "effortMinutes": 10
      },
      {
        "title": "Pay utilities (electric, water, gas, internet)",
        "effortMinutes": 20
      },
      {
        "title": "Pay credit card balances",
        "effortMinutes": 15,
        "note": "Aim to pay more than the minimum where possible."
      },
      {
        "title": "Pay insurance premiums",
        "effortMinutes": 10
      },
      {
        "title": "Confirm autopay went through for any automated bills",
        "effortMinutes": 10
      },
      {
        "title": "Record each payment in your tracker",
        "effortMinutes": 15
      },
      {
        "title": "Flag any unexpected charges or rate increases",
        "effortMinutes": 10
      },
      {
        "title": "Set reminders for any bills due before next cycle",
        "effortMinutes": 5
      }
    ]
  },
  {
    "id": "finance-subscription-audit",
    "title": "Subscription Audit",
    "description": "Find every recurring charge, cancel what you don't use, and cut your monthly spend.",
    "category": "finance",
    "icon": "ListChecks",
    "color": "#F59E0B",
    "tasks": [
      {
        "title": "Scan bank and card statements for recurring charges",
        "effortMinutes": 30,
        "section": "Find them all"
      },
      {
        "title": "Check app store subscriptions on your devices",
        "effortMinutes": 15,
        "section": "Find them all"
      },
      {
        "title": "List every subscription with cost and renewal date",
        "effortMinutes": 25,
        "section": "Find them all"
      },
      {
        "title": "Mark each as keep, downgrade, or cancel",
        "effortMinutes": 20,
        "section": "Decide"
      },
      {
        "title": "Identify duplicate or overlapping services",
        "effortMinutes": 15,
        "section": "Decide"
      },
      {
        "title": "Check for annual plans that would cost less than monthly",
        "effortMinutes": 15,
        "section": "Decide"
      },
      {
        "title": "Cancel the subscriptions you no longer need",
        "effortMinutes": 30,
        "section": "Take action",
        "note": "Save confirmation emails in case of disputed charges."
      },
      {
        "title": "Switch any worth keeping to a cheaper tier",
        "effortMinutes": 20,
        "section": "Take action"
      },
      {
        "title": "Add renewal dates to your calendar as reminders",
        "effortMinutes": 15,
        "section": "Take action"
      },
      {
        "title": "Tally your new monthly total and the savings",
        "effortMinutes": 10,
        "section": "Take action"
      }
    ]
  },
  {
    "id": "growth-learn-a-new-skill",
    "title": "Learn a New Skill",
    "description": "Go from zero to a working foundation with a structured first study session and practice loop.",
    "category": "growth",
    "icon": "Brain",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Define one concrete goal and how you'll know you've reached it",
        "effortMinutes": 15,
        "section": "Plan",
        "note": "Make it specific, e.g. 'build a simple landing page' not 'learn web design'."
      },
      {
        "title": "Pick one primary learning resource and bookmark it",
        "effortMinutes": 20,
        "section": "Plan",
        "note": "Avoid resource overload; one course or book is enough to start."
      },
      {
        "title": "Block a recurring practice slot in your calendar",
        "effortMinutes": 10,
        "section": "Plan"
      },
      {
        "title": "Set up your workspace, tools, and any required accounts",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Complete the first lesson or chapter",
        "effortMinutes": 45,
        "section": "Practice"
      },
      {
        "title": "Take notes in your own words and capture key terms",
        "effortMinutes": 20,
        "section": "Practice"
      },
      {
        "title": "Do a small hands-on exercise to apply what you learned",
        "effortMinutes": 40,
        "section": "Practice",
        "note": "Active recall and doing beats passive watching."
      },
      {
        "title": "Write down what confused you and questions to revisit",
        "effortMinutes": 10,
        "section": "Review"
      },
      {
        "title": "Schedule the next session and pick the next topic",
        "effortMinutes": 10,
        "section": "Review"
      }
    ]
  },
  {
    "id": "growth-reading-plan",
    "title": "Reading Plan",
    "description": "Set up a sustainable reading habit and finish a book with notes that stick.",
    "category": "growth",
    "icon": "BookOpen",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Choose your next book and confirm it fits your goal",
        "effortMinutes": 15,
        "section": "Set up"
      },
      {
        "title": "Decide a realistic daily page or time target",
        "effortMinutes": 10,
        "section": "Set up",
        "note": "Even 15 minutes a day adds up to several books a year."
      },
      {
        "title": "Pick a consistent reading time and place",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Get the book ready and remove nearby distractions",
        "effortMinutes": 10,
        "section": "Set up"
      },
      {
        "title": "Read today's pages",
        "effortMinutes": 30,
        "section": "Daily loop"
      },
      {
        "title": "Highlight key passages and jot a one-line takeaway",
        "effortMinutes": 15,
        "section": "Daily loop"
      },
      {
        "title": "Log your progress and update your streak",
        "effortMinutes": 5,
        "section": "Daily loop"
      },
      {
        "title": "Write a short summary of the main ideas after finishing",
        "effortMinutes": 30,
        "section": "Wrap up"
      },
      {
        "title": "Add the next book to your list",
        "effortMinutes": 10,
        "section": "Wrap up"
      }
    ]
  },
  {
    "id": "growth-job-search",
    "title": "Job Search",
    "description": "Run an organized job search from polished materials to tracked applications and follow-ups.",
    "category": "growth",
    "icon": "Briefcase",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Clarify target roles, industries, and must-have criteria",
        "effortMinutes": 30,
        "section": "Prepare"
      },
      {
        "title": "Update your resume and tailor a master version",
        "effortMinutes": 60,
        "section": "Prepare"
      },
      {
        "title": "Refresh your LinkedIn profile and headline",
        "effortMinutes": 40,
        "section": "Prepare"
      },
      {
        "title": "Draft a reusable cover letter template",
        "effortMinutes": 30,
        "section": "Prepare"
      },
      {
        "title": "Set up a tracker for applications and statuses",
        "effortMinutes": 20,
        "section": "Prepare",
        "note": "A simple spreadsheet with company, role, date, and status works well."
      },
      {
        "title": "Search and shortlist openings that fit your criteria",
        "effortMinutes": 45,
        "section": "Apply"
      },
      {
        "title": "Tailor your resume and apply to top picks",
        "effortMinutes": 60,
        "section": "Apply"
      },
      {
        "title": "Reach out to contacts or recruiters for referrals",
        "effortMinutes": 30,
        "section": "Apply"
      },
      {
        "title": "Log every application in your tracker",
        "effortMinutes": 15,
        "section": "Apply"
      },
      {
        "title": "Follow up on applications older than a week",
        "effortMinutes": 20,
        "section": "Follow up"
      },
      {
        "title": "Review what's working and adjust your approach",
        "effortMinutes": 20,
        "section": "Follow up"
      }
    ]
  },
  {
    "id": "growth-interview-prep",
    "title": "Interview Prep",
    "description": "Get ready to perform: research the company, rehearse answers, and prepare your logistics.",
    "category": "growth",
    "icon": "Target",
    "color": "#6C5CE7",
    "tasks": [
      {
        "title": "Re-read the job description and note key requirements",
        "effortMinutes": 20,
        "section": "Research"
      },
      {
        "title": "Research the company, product, and recent news",
        "effortMinutes": 40,
        "section": "Research"
      },
      {
        "title": "Look up your interviewers and their roles",
        "effortMinutes": 20,
        "section": "Research"
      },
      {
        "title": "Prepare your two-minute introduction",
        "effortMinutes": 25,
        "section": "Rehearse"
      },
      {
        "title": "Draft STAR stories for common behavioral questions",
        "effortMinutes": 60,
        "section": "Rehearse",
        "note": "Use the Situation, Task, Action, Result format for clear examples."
      },
      {
        "title": "Practice role-specific or technical questions out loud",
        "effortMinutes": 45,
        "section": "Rehearse"
      },
      {
        "title": "Do a timed mock interview or record yourself",
        "effortMinutes": 30,
        "section": "Rehearse"
      },
      {
        "title": "Prepare thoughtful questions to ask the interviewer",
        "effortMinutes": 20,
        "section": "Logistics"
      },
      {
        "title": "Plan your outfit, route, or test your video setup",
        "effortMinutes": 20,
        "section": "Logistics"
      },
      {
        "title": "Print copies of your resume and review your notes",
        "effortMinutes": 15,
        "section": "Logistics"
      }
    ]
  },
  {
    "id": "students-exam-prep",
    "title": "Exam Prep",
    "description": "A focused study run-up to walk into your exam calm and ready.",
    "category": "students",
    "icon": "GraduationCap",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "List every topic the exam will cover",
        "effortMinutes": 20,
        "section": "Plan",
        "note": "Pull from the syllabus, slides, and any review guide."
      },
      {
        "title": "Rate each topic by confidence (weak / okay / strong)",
        "effortMinutes": 15,
        "section": "Plan",
        "note": "Spend the most time on the weak ones."
      },
      {
        "title": "Block out study sessions across the days you have left",
        "effortMinutes": 15,
        "section": "Plan"
      },
      {
        "title": "Gather all materials: notes, slides, textbook, past papers",
        "effortMinutes": 20,
        "section": "Study"
      },
      {
        "title": "Re-read and condense notes into a one-page summary per topic",
        "effortMinutes": 90,
        "section": "Study"
      },
      {
        "title": "Make flashcards for key terms, formulas, and definitions",
        "effortMinutes": 45,
        "section": "Study"
      },
      {
        "title": "Work through a past paper or practice problems under time",
        "effortMinutes": 90,
        "section": "Study",
        "note": "Simulate real conditions: no notes, a timer running."
      },
      {
        "title": "Review every question you got wrong and note why",
        "effortMinutes": 40,
        "section": "Study"
      },
      {
        "title": "Do a final flashcard pass on weak topics",
        "effortMinutes": 30,
        "section": "Day before"
      },
      {
        "title": "Pack your bag: ID, pens, calculator, water, allowed materials",
        "effortMinutes": 10,
        "section": "Day before"
      },
      {
        "title": "Confirm exam time, room, and travel plan",
        "effortMinutes": 10,
        "section": "Day before"
      },
      {
        "title": "Get a full night of sleep",
        "effortMinutes": 15,
        "section": "Day before",
        "note": "Stop cramming the night before; rest beats one more topic."
      }
    ]
  },
  {
    "id": "students-assignment-workflow",
    "title": "Assignment Workflow",
    "description": "Take any essay or assignment from blank page to submitted on time.",
    "category": "students",
    "icon": "FileText",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Read the prompt and rubric carefully, twice",
        "effortMinutes": 15,
        "note": "Highlight required word count, format, and due date."
      },
      {
        "title": "Note the deadline and work backward to set milestones",
        "effortMinutes": 10
      },
      {
        "title": "Brainstorm and pick your topic or thesis",
        "effortMinutes": 30
      },
      {
        "title": "Research and collect sources, saving citations as you go",
        "effortMinutes": 90
      },
      {
        "title": "Build an outline with your main points and evidence",
        "effortMinutes": 40
      },
      {
        "title": "Write the first draft without editing as you go",
        "effortMinutes": 120,
        "note": "Get it all down; perfection comes later."
      },
      {
        "title": "Step away, then revise for structure and clarity",
        "effortMinutes": 60
      },
      {
        "title": "Proofread for grammar, spelling, and flow",
        "effortMinutes": 30
      },
      {
        "title": "Format citations and build the reference list",
        "effortMinutes": 25
      },
      {
        "title": "Check the work against the rubric point by point",
        "effortMinutes": 20
      },
      {
        "title": "Submit and confirm the upload went through",
        "effortMinutes": 10,
        "note": "Screenshot the confirmation in case of disputes."
      }
    ]
  },
  {
    "id": "students-semester-setup",
    "title": "Semester Setup",
    "description": "Start the term organized so nothing slips through the cracks later.",
    "category": "students",
    "icon": "CalendarDays",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "Confirm your final class schedule and locations",
        "effortMinutes": 20
      },
      {
        "title": "Download the syllabus for every course",
        "effortMinutes": 20
      },
      {
        "title": "Add all exam dates and major deadlines to your calendar",
        "effortMinutes": 30,
        "note": "Pull these straight from each syllabus."
      },
      {
        "title": "Set up a note system and folder per course",
        "effortMinutes": 25
      },
      {
        "title": "Log in to each course portal and check it works",
        "effortMinutes": 15
      },
      {
        "title": "Buy or rent required textbooks and materials",
        "effortMinutes": 40
      },
      {
        "title": "Block recurring study and class time on your calendar",
        "effortMinutes": 30
      },
      {
        "title": "Note office hours and instructor contact info",
        "effortMinutes": 15
      },
      {
        "title": "Set up your study space and supplies",
        "effortMinutes": 30
      },
      {
        "title": "Review the grading breakdown and attendance policy per course",
        "effortMinutes": 20
      }
    ]
  },
  {
    "id": "students-study-plan",
    "title": "Weekly Study Plan",
    "description": "Build a repeatable weekly study routine that actually sticks.",
    "category": "students",
    "icon": "ClipboardList",
    "color": "#4EA8FF",
    "tasks": [
      {
        "title": "List all open tasks, readings, and upcoming deadlines",
        "effortMinutes": 20
      },
      {
        "title": "Prioritize by deadline and weight in your grade",
        "effortMinutes": 15
      },
      {
        "title": "Map study sessions onto your free time blocks",
        "effortMinutes": 20,
        "note": "Be honest about how much focused time you really have."
      },
      {
        "title": "Review and rewrite notes from this week's lectures",
        "effortMinutes": 60
      },
      {
        "title": "Complete assigned readings with active notes",
        "effortMinutes": 90
      },
      {
        "title": "Work through this week's problem sets or exercises",
        "effortMinutes": 75
      },
      {
        "title": "Do a focused session on your hardest subject",
        "effortMinutes": 60,
        "note": "Tackle it when your energy is highest."
      },
      {
        "title": "Self-quiz on the week's material to find gaps",
        "effortMinutes": 30
      },
      {
        "title": "Take a real break to recharge",
        "effortMinutes": 30
      },
      {
        "title": "Review what got done and plan next week",
        "effortMinutes": 20
      }
    ]
  },
  {
    "id": "beginnings-first-week-new-job",
    "title": "First Week at a New Job",
    "description": "Land well in week one: paperwork, setup, intros, and learning the ropes",
    "category": "beginnings",
    "icon": "Briefcase",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Confirm start time, location, dress code, and who to ask for",
        "effortMinutes": 10,
        "section": "Day 1 essentials",
        "note": "Double-check the night before to avoid first-day surprises."
      },
      {
        "title": "Bring ID and complete HR onboarding and payroll paperwork",
        "effortMinutes": 45,
        "section": "Day 1 essentials",
        "note": "Bank details and tax forms usually need to be done up front."
      },
      {
        "title": "Set up laptop, accounts, email, and required software",
        "effortMinutes": 60,
        "section": "Day 1 essentials"
      },
      {
        "title": "Take a tour: desk, restrooms, kitchen, exits, and parking",
        "effortMinutes": 20,
        "section": "Day 1 essentials"
      },
      {
        "title": "Meet your manager and confirm expectations for week one",
        "effortMinutes": 30,
        "section": "People"
      },
      {
        "title": "Introduce yourself to your immediate team and key contacts",
        "effortMinutes": 30,
        "section": "People"
      },
      {
        "title": "Add teammates and important channels to your contacts and chat",
        "effortMinutes": 15,
        "section": "People"
      },
      {
        "title": "Read onboarding docs, handbook, and team wiki",
        "effortMinutes": 60,
        "section": "Learning the ropes"
      },
      {
        "title": "Review your role's goals and current projects",
        "effortMinutes": 45,
        "section": "Learning the ropes"
      },
      {
        "title": "Note recurring meetings and add them to your calendar",
        "effortMinutes": 15,
        "section": "Learning the ropes"
      },
      {
        "title": "Write down questions and a list of who owns what",
        "effortMinutes": 20,
        "section": "Wrap up"
      },
      {
        "title": "Set 30-, 60-, and 90-day goals with your manager",
        "effortMinutes": 30,
        "section": "Wrap up"
      }
    ]
  },
  {
    "id": "beginnings-new-baby-prep",
    "title": "New Baby Prep",
    "description": "Get the home, gear, and logistics ready before the baby arrives",
    "category": "beginnings",
    "icon": "Baby",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Set up the crib and a safe sleep space",
        "effortMinutes": 90,
        "section": "Nursery and gear"
      },
      {
        "title": "Wash and organize newborn clothes, blankets, and burp cloths",
        "effortMinutes": 60,
        "section": "Nursery and gear"
      },
      {
        "title": "Install and check the car seat",
        "effortMinutes": 45,
        "section": "Nursery and gear",
        "note": "Many areas offer free car seat inspection checks."
      },
      {
        "title": "Assemble stroller, bassinet, and changing station",
        "effortMinutes": 60,
        "section": "Nursery and gear"
      },
      {
        "title": "Stock diapers, wipes, and diaper cream",
        "effortMinutes": 30,
        "section": "Supplies"
      },
      {
        "title": "Set up feeding supplies (bottles, and pump if using)",
        "effortMinutes": 45,
        "section": "Supplies"
      },
      {
        "title": "Stock postpartum and recovery essentials for the parent",
        "effortMinutes": 30,
        "section": "Supplies"
      },
      {
        "title": "Pack the hospital bag for parent and baby",
        "effortMinutes": 45,
        "section": "Logistics"
      },
      {
        "title": "Save key phone numbers and map the route to the hospital",
        "effortMinutes": 20,
        "section": "Logistics"
      },
      {
        "title": "Choose a pediatrician and book the first appointment",
        "effortMinutes": 30,
        "section": "Logistics"
      },
      {
        "title": "Prep and freeze a few easy meals",
        "effortMinutes": 120,
        "section": "Logistics"
      },
      {
        "title": "Confirm parental leave and notify your employer",
        "effortMinutes": 30,
        "section": "Logistics"
      },
      {
        "title": "Baby-proof basics and test smoke and CO detectors",
        "effortMinutes": 45,
        "section": "Home safety"
      }
    ]
  },
  {
    "id": "beginnings-new-pet",
    "title": "Welcoming a New Pet",
    "description": "Prepare your home and routine for a new dog or cat",
    "category": "beginnings",
    "icon": "Dog",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Buy food, bowls, bed, collar, and ID tag",
        "effortMinutes": 60,
        "section": "Before they arrive"
      },
      {
        "title": "Get a leash, carrier, or crate for safe transport",
        "effortMinutes": 30,
        "section": "Before they arrive"
      },
      {
        "title": "Pet-proof the home and remove hazards",
        "effortMinutes": 45,
        "section": "Before they arrive",
        "note": "Secure cords, cleaning supplies, and toxic plants."
      },
      {
        "title": "Set up a feeding station and a quiet resting area",
        "effortMinutes": 30,
        "section": "Before they arrive"
      },
      {
        "title": "Pick up your pet and bring them home calmly",
        "effortMinutes": 60,
        "section": "Settling in"
      },
      {
        "title": "Introduce them to one room first, then expand slowly",
        "effortMinutes": 30,
        "section": "Settling in"
      },
      {
        "title": "Establish a feeding, potty, and walk routine",
        "effortMinutes": 30,
        "section": "Settling in"
      },
      {
        "title": "Find a local vet and book the first checkup",
        "effortMinutes": 30,
        "section": "Health and admin"
      },
      {
        "title": "Gather any vaccination and adoption records",
        "effortMinutes": 20,
        "section": "Health and admin"
      },
      {
        "title": "Update microchip details or arrange microchipping",
        "effortMinutes": 20,
        "section": "Health and admin"
      },
      {
        "title": "Check local pet license or registration requirements",
        "effortMinutes": 20,
        "section": "Health and admin"
      },
      {
        "title": "Buy a few toys and start basic training and bonding",
        "effortMinutes": 30,
        "section": "Settling in"
      }
    ]
  },
  {
    "id": "beginnings-new-apartment-setup",
    "title": "New Apartment Setup",
    "description": "Turn an empty apartment into a working home, from utilities to unpacking",
    "category": "beginnings",
    "icon": "Home",
    "color": "#F43F5E",
    "tasks": [
      {
        "title": "Schedule utilities: electricity, gas, water, and internet",
        "effortMinutes": 45,
        "section": "Before move-in",
        "note": "Book internet early; install slots fill up fast."
      },
      {
        "title": "Do a move-in inspection and photograph existing damage",
        "effortMinutes": 45,
        "section": "Before move-in",
        "note": "Protects your deposit when you move out."
      },
      {
        "title": "Deep clean before unpacking",
        "effortMinutes": 120,
        "section": "Before move-in"
      },
      {
        "title": "Unpack and set up the bedroom first",
        "effortMinutes": 90,
        "section": "Settle in"
      },
      {
        "title": "Set up the kitchen essentials and basic cookware",
        "effortMinutes": 90,
        "section": "Settle in"
      },
      {
        "title": "Set up the bathroom with toiletries and supplies",
        "effortMinutes": 30,
        "section": "Settle in"
      },
      {
        "title": "Test smoke and CO detectors and replace batteries",
        "effortMinutes": 20,
        "section": "Safety and security"
      },
      {
        "title": "Locate the breaker box and main water shutoff",
        "effortMinutes": 15,
        "section": "Safety and security"
      },
      {
        "title": "Get spare keys and confirm building access details",
        "effortMinutes": 30,
        "section": "Safety and security"
      },
      {
        "title": "Update your address with bank, work, and subscriptions",
        "effortMinutes": 45,
        "section": "Admin"
      },
      {
        "title": "Set up renters insurance",
        "effortMinutes": 30,
        "section": "Admin"
      },
      {
        "title": "Learn trash, recycling, and laundry schedules",
        "effortMinutes": 15,
        "section": "Admin"
      },
      {
        "title": "Buy first grocery and household supply run",
        "effortMinutes": 60,
        "section": "Settle in"
      },
      {
        "title": "Introduce yourself to neighbors or building manager",
        "effortMinutes": 15,
        "section": "Settle in"
      }
    ]
  },
  {
    "id": "seasonal-spring-cleaning",
    "title": "Spring Cleaning",
    "description": "Deep-clean the whole home room by room and refresh it for the new season.",
    "category": "seasonal",
    "icon": "Brush",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Declutter and box up items to donate, sell, or toss",
        "effortMinutes": 60,
        "section": "Declutter",
        "note": "Use three labeled bins so decisions stay quick."
      },
      {
        "title": "Strip beds and wash all bedding, throws, and pillow covers",
        "effortMinutes": 45,
        "section": "Declutter"
      },
      {
        "title": "Dust ceilings, fans, light fixtures, and corners top to bottom",
        "effortMinutes": 30,
        "section": "Deep clean"
      },
      {
        "title": "Wipe down walls, baseboards, doors, and switch plates",
        "effortMinutes": 40,
        "section": "Deep clean"
      },
      {
        "title": "Clean interior windows, sills, tracks, and mirrors",
        "effortMinutes": 45,
        "section": "Deep clean"
      },
      {
        "title": "Deep-clean the kitchen: appliances, cabinet fronts, and sink",
        "effortMinutes": 60,
        "section": "Deep clean"
      },
      {
        "title": "Scrub the bathroom: tile, grout, fixtures, and drains",
        "effortMinutes": 45,
        "section": "Deep clean"
      },
      {
        "title": "Vacuum and mop all floors; spot-treat carpets and rugs",
        "effortMinutes": 40,
        "section": "Deep clean"
      },
      {
        "title": "Swap winter clothes and bedding into storage",
        "effortMinutes": 30,
        "section": "Refresh"
      },
      {
        "title": "Replace HVAC filter and test smoke and CO detectors",
        "effortMinutes": 20,
        "section": "Refresh",
        "note": "Easy to forget but high-impact for safety."
      },
      {
        "title": "Take out donations, recycling, and trash",
        "effortMinutes": 30,
        "section": "Refresh"
      }
    ]
  },
  {
    "id": "seasonal-holiday-prep",
    "title": "Holiday Prep",
    "description": "Plan gifts, food, and gatherings so the holidays run smoothly and stress-free.",
    "category": "seasonal",
    "icon": "Gift",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Set a holiday budget for gifts, food, travel, and decor",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Build the gift list with names, ideas, and price caps",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Confirm guest list, dates, and who is hosting",
        "effortMinutes": 20,
        "section": "Plan"
      },
      {
        "title": "Plan the menu and assign dishes or potluck items",
        "effortMinutes": 30,
        "section": "Plan"
      },
      {
        "title": "Shop for gifts and check off the list",
        "effortMinutes": 120,
        "section": "Shop & prep"
      },
      {
        "title": "Order anything that needs shipping time",
        "effortMinutes": 30,
        "section": "Shop & prep",
        "note": "Lock in early to beat shipping cutoffs."
      },
      {
        "title": "Grocery shop for the meal and pantry staples",
        "effortMinutes": 60,
        "section": "Shop & prep"
      },
      {
        "title": "Wrap gifts and label them by recipient",
        "effortMinutes": 60,
        "section": "Shop & prep"
      },
      {
        "title": "Decorate the home and set up lighting",
        "effortMinutes": 60,
        "section": "Shop & prep"
      },
      {
        "title": "Send cards, invites, or holiday greetings",
        "effortMinutes": 30,
        "section": "Shop & prep"
      },
      {
        "title": "Prep make-ahead dishes and set the table the day before",
        "effortMinutes": 90,
        "section": "Final stretch"
      },
      {
        "title": "Tidy guest spaces and stock essentials",
        "effortMinutes": 30,
        "section": "Final stretch"
      }
    ]
  },
  {
    "id": "seasonal-new-year-reset",
    "title": "New Year Reset",
    "description": "Close out last year and set clear goals, systems, and a fresh start for the year ahead.",
    "category": "seasonal",
    "icon": "Sparkles",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Reflect on last year: wins, lessons, and what to drop",
        "effortMinutes": 45,
        "section": "Reflect"
      },
      {
        "title": "Set 3 to 5 priorities across health, work, money, and relationships",
        "effortMinutes": 45,
        "section": "Reflect",
        "note": "Keep it short so each goal gets real focus."
      },
      {
        "title": "Break each priority into a first concrete next step",
        "effortMinutes": 30,
        "section": "Reflect"
      },
      {
        "title": "Review last year's spending and set this year's budget",
        "effortMinutes": 45,
        "section": "Finances"
      },
      {
        "title": "Cancel unused subscriptions and recurring charges",
        "effortMinutes": 30,
        "section": "Finances"
      },
      {
        "title": "Update or set a savings goal and automate a transfer",
        "effortMinutes": 20,
        "section": "Finances"
      },
      {
        "title": "Clean up digital files, inbox, and desktop",
        "effortMinutes": 45,
        "section": "Reset systems"
      },
      {
        "title": "Update passwords and back up important data",
        "effortMinutes": 30,
        "section": "Reset systems"
      },
      {
        "title": "Refresh your calendar with key dates and recurring routines",
        "effortMinutes": 30,
        "section": "Reset systems"
      },
      {
        "title": "Book overdue appointments and renewals",
        "effortMinutes": 30,
        "section": "Reset systems",
        "note": "Think checkups, registrations, and IDs."
      },
      {
        "title": "Schedule a weekly review to track progress",
        "effortMinutes": 15,
        "section": "Reset systems"
      }
    ]
  },
  {
    "id": "seasonal-summer-prep",
    "title": "Summer Prep",
    "description": "Get your home, yard, and gear ready for warm weather and the months ahead.",
    "category": "seasonal",
    "icon": "Sun",
    "color": "#22D3A6",
    "tasks": [
      {
        "title": "Service the AC, clean vents, and replace the filter",
        "effortMinutes": 30,
        "section": "Home & comfort"
      },
      {
        "title": "Set up fans, screens, and window coverings for heat",
        "effortMinutes": 30,
        "section": "Home & comfort"
      },
      {
        "title": "Swap winter wardrobe for summer clothes",
        "effortMinutes": 45,
        "section": "Home & comfort"
      },
      {
        "title": "Deep-clean the grill and check propane or charcoal",
        "effortMinutes": 30,
        "section": "Outdoor"
      },
      {
        "title": "Clean and set up patio furniture and cushions",
        "effortMinutes": 40,
        "section": "Outdoor"
      },
      {
        "title": "Mow, weed, and refresh garden beds with mulch",
        "effortMinutes": 90,
        "section": "Outdoor"
      },
      {
        "title": "Inspect and test outdoor lighting and the hose",
        "effortMinutes": 20,
        "section": "Outdoor"
      },
      {
        "title": "Restock sunscreen, bug spray, and a basic first-aid kit",
        "effortMinutes": 20,
        "section": "Gear & getaways"
      },
      {
        "title": "Inventory pool, beach, and outdoor gear; replace what's worn",
        "effortMinutes": 30,
        "section": "Gear & getaways"
      },
      {
        "title": "Plan summer trips, camps, and weekend outings",
        "effortMinutes": 45,
        "section": "Gear & getaways"
      },
      {
        "title": "Check the car: tires, fluids, and AC before road trips",
        "effortMinutes": 30,
        "section": "Gear & getaways"
      }
    ]
  },
  {
    "id": "checklists-gym-ppl-push",
    "title": "Gym: Push Day (PPL)",
    "description": "Chest, shoulders and triceps. Tick your way down the rack — no dates, just the session.",
    "category": "checklists",
    "icon": "Dumbbell",
    "color": "#22D3A6",
    "style": "checklist",
    "tasks": [
      {
        "title": "Warm up: 5 min bike or rower",
        "effortMinutes": 5,
        "section": "Warm-up"
      },
      {
        "title": "Shoulder dislocates and band pull-aparts",
        "effortMinutes": 5,
        "section": "Warm-up"
      },
      {
        "title": "Bench press — 4 x 6",
        "effortMinutes": 15,
        "section": "Main lifts"
      },
      {
        "title": "Overhead press — 3 x 8",
        "effortMinutes": 12,
        "section": "Main lifts"
      },
      {
        "title": "Incline dumbbell press — 3 x 10",
        "effortMinutes": 10,
        "section": "Accessories"
      },
      {
        "title": "Lateral raises — 3 x 15",
        "effortMinutes": 8,
        "section": "Accessories"
      },
      {
        "title": "Triceps rope pushdown — 3 x 12",
        "effortMinutes": 8,
        "section": "Accessories"
      },
      {
        "title": "Cool down and stretch",
        "effortMinutes": 7,
        "section": "Finish"
      },
      {
        "title": "Log the weights you actually used",
        "effortMinutes": 3,
        "section": "Finish",
        "note": "Next week's numbers come from this."
      }
    ]
  },
  {
    "id": "checklists-gym-ppl-pull",
    "title": "Gym: Pull Day (PPL)",
    "description": "Back and biceps. The same list every pull day, so you never improvise at the rack.",
    "category": "checklists",
    "icon": "Dumbbell",
    "color": "#22D3A6",
    "style": "checklist",
    "tasks": [
      {
        "title": "Warm up: 5 min easy cardio",
        "effortMinutes": 5,
        "section": "Warm-up"
      },
      {
        "title": "Scapular pull-ups and band rows",
        "effortMinutes": 5,
        "section": "Warm-up"
      },
      {
        "title": "Deadlift — 3 x 5",
        "effortMinutes": 18,
        "section": "Main lifts"
      },
      {
        "title": "Pull-ups or assisted pull-ups — 4 x 8",
        "effortMinutes": 12,
        "section": "Main lifts"
      },
      {
        "title": "Barbell row — 3 x 8",
        "effortMinutes": 12,
        "section": "Accessories"
      },
      {
        "title": "Face pulls — 3 x 15",
        "effortMinutes": 8,
        "section": "Accessories"
      },
      {
        "title": "Hammer curls — 3 x 12",
        "effortMinutes": 8,
        "section": "Accessories"
      },
      {
        "title": "Cool down and stretch",
        "effortMinutes": 7,
        "section": "Finish"
      },
      {
        "title": "Log the weights you actually used",
        "effortMinutes": 3,
        "section": "Finish"
      }
    ]
  },
  {
    "id": "checklists-gym-ppl-legs",
    "title": "Gym: Leg Day (PPL)",
    "description": "Quads, hamstrings and calves — the day everyone skips, made harder to skip.",
    "category": "checklists",
    "icon": "Dumbbell",
    "color": "#22D3A6",
    "style": "checklist",
    "tasks": [
      {
        "title": "Warm up: 5 min bike",
        "effortMinutes": 5,
        "section": "Warm-up"
      },
      {
        "title": "Hip openers and bodyweight squats",
        "effortMinutes": 6,
        "section": "Warm-up"
      },
      {
        "title": "Back squat — 4 x 6",
        "effortMinutes": 20,
        "section": "Main lifts"
      },
      {
        "title": "Romanian deadlift — 3 x 8",
        "effortMinutes": 12,
        "section": "Main lifts"
      },
      {
        "title": "Leg press — 3 x 12",
        "effortMinutes": 10,
        "section": "Accessories"
      },
      {
        "title": "Walking lunges — 3 x 20 steps",
        "effortMinutes": 10,
        "section": "Accessories"
      },
      {
        "title": "Standing calf raises — 4 x 15",
        "effortMinutes": 8,
        "section": "Accessories"
      },
      {
        "title": "Cool down and stretch",
        "effortMinutes": 8,
        "section": "Finish"
      },
      {
        "title": "Log the weights you actually used",
        "effortMinutes": 3,
        "section": "Finish"
      }
    ]
  },
  {
    "id": "checklists-morning-pages",
    "title": "Morning Pages",
    "description": "Three pages, longhand, before the day starts talking. The same list every morning.",
    "category": "checklists",
    "icon": "Pencil",
    "color": "#6C5CE7",
    "style": "checklist",
    "tasks": [
      {
        "title": "Glass of water, phone face down",
        "effortMinutes": 3
      },
      {
        "title": "Write page one — whatever is loudest",
        "effortMinutes": 8,
        "note": "No editing, no rereading. Volume beats quality here."
      },
      {
        "title": "Write page two — what you are avoiding",
        "effortMinutes": 8
      },
      {
        "title": "Write page three — what you actually want from today",
        "effortMinutes": 8
      },
      {
        "title": "Underline anything that turned out to be a task",
        "effortMinutes": 4,
        "note": "Those belong in the Inbox, not back on the page."
      },
      {
        "title": "Close the notebook and start the day",
        "effortMinutes": 2
      }
    ]
  },
  {
    "id": "checklists-weekly-shutdown",
    "title": "Weekly Shutdown",
    "description": "Close the week properly so Monday starts from a clean desk instead of a pile.",
    "category": "checklists",
    "icon": "ClipboardCheck",
    "color": "#4EA8FF",
    "style": "checklist",
    "tasks": [
      {
        "title": "Empty the Inbox to zero",
        "effortMinutes": 15,
        "section": "Clear"
      },
      {
        "title": "Reply to anything still owed an answer",
        "effortMinutes": 20,
        "section": "Clear"
      },
      {
        "title": "Close every tab and file the desktop",
        "effortMinutes": 10,
        "section": "Clear"
      },
      {
        "title": "Reschedule what did not get done, honestly",
        "effortMinutes": 15,
        "section": "Review",
        "note": "Moving it is fine. Pretending next week has more hours is not."
      },
      {
        "title": "Read back this week's completed work",
        "effortMinutes": 10,
        "section": "Review"
      },
      {
        "title": "Pick the three things that matter next week",
        "effortMinutes": 15,
        "section": "Plan ahead"
      },
      {
        "title": "Check next week's calendar for surprises",
        "effortMinutes": 10,
        "section": "Plan ahead"
      },
      {
        "title": "Write one line about how the week actually felt",
        "effortMinutes": 5,
        "section": "Plan ahead"
      }
    ]
  },
  {
    "id": "checklists-evening-shutdown",
    "title": "Evening Shutdown",
    "description": "A short end-of-day list that lets you stop thinking about work.",
    "category": "checklists",
    "icon": "Sunset",
    "color": "#6C5CE7",
    "style": "checklist",
    "tasks": [
      {
        "title": "Capture every loose thought into the Inbox",
        "effortMinutes": 8
      },
      {
        "title": "Roll over anything unfinished to a real day",
        "effortMinutes": 6
      },
      {
        "title": "Glance at tomorrow's first task so you know where to start",
        "effortMinutes": 4
      },
      {
        "title": "Tidy the desk and shut the laptop",
        "effortMinutes": 5
      },
      {
        "title": "Say the day is over, out loud if it helps",
        "effortMinutes": 2,
        "note": "A deliberate stop is what stops the low-grade replaying."
      }
    ]
  },
  {
    "id": "checklists-carry-on-packing",
    "title": "Carry-On Packing List",
    "description": "One bag, no checked luggage. Reuse it every trip instead of rebuilding it at midnight.",
    "category": "checklists",
    "icon": "Luggage",
    "color": "#4EA8FF",
    "style": "checklist",
    "tasks": [
      {
        "title": "Passport, ID and boarding pass",
        "effortMinutes": 5,
        "section": "Documents"
      },
      {
        "title": "Card, some cash, travel insurance details",
        "effortMinutes": 5,
        "section": "Documents"
      },
      {
        "title": "Outfits counted against actual days away",
        "effortMinutes": 20,
        "section": "Clothes",
        "note": "Count the days. Then take one fewer."
      },
      {
        "title": "One warm layer and something waterproof",
        "effortMinutes": 5,
        "section": "Clothes"
      },
      {
        "title": "Toiletries in under 100ml bottles",
        "effortMinutes": 10,
        "section": "Toiletries"
      },
      {
        "title": "Any medication, in its original packaging",
        "effortMinutes": 5,
        "section": "Toiletries"
      },
      {
        "title": "Chargers, cable, adapter, power bank",
        "effortMinutes": 8,
        "section": "Tech"
      },
      {
        "title": "Headphones and something to read offline",
        "effortMinutes": 5,
        "section": "Tech"
      },
      {
        "title": "Weigh the bag before you leave the house",
        "effortMinutes": 5,
        "section": "Last look"
      },
      {
        "title": "Bins out, plants watered, heating down",
        "effortMinutes": 10,
        "section": "Last look"
      }
    ]
  },
  {
    "id": "checklists-deep-clean-kitchen",
    "title": "Kitchen Deep Clean",
    "description": "The monthly pass that normal tidying never covers. Tick it, forget it, run it again.",
    "category": "checklists",
    "icon": "Brush",
    "color": "#22D3A6",
    "style": "checklist",
    "tasks": [
      {
        "title": "Clear and wipe every counter",
        "effortMinutes": 15,
        "section": "Surfaces"
      },
      {
        "title": "Degrease the hob and splashback",
        "effortMinutes": 20,
        "section": "Surfaces"
      },
      {
        "title": "Wipe cupboard doors and handles",
        "effortMinutes": 15,
        "section": "Surfaces"
      },
      {
        "title": "Empty the fridge, bin what has turned, wipe the shelves",
        "effortMinutes": 30,
        "section": "Appliances"
      },
      {
        "title": "Run the dishwasher empty on a hot cycle",
        "effortMinutes": 10,
        "section": "Appliances"
      },
      {
        "title": "Descale the kettle and clean the coffee machine",
        "effortMinutes": 15,
        "section": "Appliances"
      },
      {
        "title": "Clean the oven racks and door glass",
        "effortMinutes": 30,
        "section": "Appliances"
      },
      {
        "title": "Scrub the sink and unclog the drain",
        "effortMinutes": 15,
        "section": "Floor & bins"
      },
      {
        "title": "Take out recycling and wash the bin",
        "effortMinutes": 15,
        "section": "Floor & bins"
      },
      {
        "title": "Sweep and mop the floor",
        "effortMinutes": 20,
        "section": "Floor & bins"
      }
    ]
  }
]

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]))

export function getTemplate(id: string): Template | undefined {
  return BY_ID.get(id)
}

export function templatesByCategory(categoryId: string): Template[] {
  return TEMPLATES.filter((t) => t.category === categoryId)
}

export function totalEffortMinutes(template: Template): number {
  return template.tasks.reduce((sum, t) => sum + t.effortMinutes, 0)
}

/** Human duration: 150 -> "2h 30m", 45 -> "45m", 120 -> "2h". */
export function formatEffort(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60)
  const mins = m % 60
  if (h === 0) return `${mins}m`
  if (mins === 0) return `${h}h`
  return `${h}h ${mins}m`
}

export function templateIcon(template: Template): LucideIcon {
  return resolveTemplateIcon(template.icon)
}

export function categoryIcon(category: TemplateCategory): LucideIcon {
  return resolveTemplateIcon(category.icon)
}

export const TEMPLATE_COUNT = TEMPLATES.length
