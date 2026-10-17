import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-auth";
import { createUser, deleteUser, listUsers } from "@/lib/users";

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ users: await listUsers() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { name?: unknown; email?: unknown; password?: unknown; role?: unknown };
    if (body.role !== "reader" && body.role !== "editor") throw new Error("Profil invalide");
    const user = await createUser({
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      role: body.role,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Création impossible" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { email?: unknown };
    await deleteUser(String(body.email || ""));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Suppression impossible" }, { status: 400 });
  }
}
