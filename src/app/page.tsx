import { redirect } from "next/navigation";

// The app lands on Calendar; the Today deck lives at /today.
export default function Root() {
  redirect("/calendar");
}
