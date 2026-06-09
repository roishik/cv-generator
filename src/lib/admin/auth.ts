import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { isAdminEmail } from "./admin-emails";

export async function requireAdminUser(): Promise<{
  id: string;
  email: string;
  name?: string | null;
}> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (!isAdminEmail(session.user.email)) notFound();
  return {
    id: session.user.id,
    email: session.user.email!,
    name: session.user.name,
  };
}
