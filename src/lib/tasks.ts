// Shared types for the event page's task-delegation checklist.
//
// A task carries a SET of assignees (a subset of the guest list), each with
// their own done state. Progress is derived from those rows.

export interface TaskAssignee {
  /** profile id */
  id: string;
  name: string;
  done: boolean;
  /** This assignee is the active persona. */
  isMe: boolean;
}

export interface EventTask {
  id: string;
  title: string;
  createdBy: string;
  /** The active persona created this task. */
  isMine: boolean;
  assignees: TaskAssignee[];
  /** assignees.length */
  total: number;
  doneCount: number;
  /** total > 0 && everyone is done */
  allDone: boolean;
  /** The active persona is one of the assignees. */
  assignedToMe: boolean;
  /** The active persona's own done state (false if not assigned). */
  myDone: boolean;
}

export interface TaskPerson {
  id: string;
  name: string;
}

export interface TaskData {
  people: TaskPerson[];
  tasks: EventTask[];
}
