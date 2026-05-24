"use client";

export default function LogoutButton() {
  async function handle() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      onClick={handle}
      className="px-3 py-1.5 rounded-md hover:bg-rose-50 text-rose-500"
    >
      登出
    </button>
  );
}
