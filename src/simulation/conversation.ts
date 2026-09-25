import type { ConversationMessage } from "./types";

export const conversation: ConversationMessage[] = [
  {
    id: "father-00",
    sentAt: 0,
    sender: "father",
    text: "I am here. Can you hear me on the Moon?",
    action: "speaks, smiles and raises his hand"
  },
  {
    id: "daughter-01",
    sentAt: 1,
    sender: "daughter",
    text: "I hear you, Dad. I can see your expression now.",
    action: "smiles and reaches toward his image"
  },
  {
    id: "father-02",
    sentAt: 2,
    sender: "father",
    text: "Your movement makes this distance feel smaller.",
    action: "nods and holds out his hand"
  },
  {
    id: "daughter-03",
    sentAt: 3,
    sender: "daughter",
    text: "Now the room feels shared, even from here.",
    action: "meets his gaze and waves"
  }
];
