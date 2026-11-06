"use client";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
export default function Login() {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function signIn(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");
    try {const {error}=await getSupabaseBrowserClient().auth.signInWithPassword({email,password});if(error)throw error;window.location.assign("/dashboard");}
    catch(e){setError(e instanceof Error?e.message:"تعذر تسجيل الدخول");}finally{setBusy(false);}
  }
  return <main className="shell"><header className="top"><a className="logo" href="/">سِير.</a><span className="tag">SEER</span></header><section className="card" style={{maxWidth:420,margin:"64px auto"}}><h1>تسجيل الدخول</h1><p>حساب موظفي وإداريي المنشآت</p><form onSubmit={signIn} style={{display:"grid",gap:16}}><label>البريد الإلكتروني<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:"block",width:"100%",padding:12,marginTop:8}}/></label><label>كلمة المرور<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",padding:12,marginTop:8}}/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy} style={{background:"#0f5e4c",color:"white",padding:14,border:0,borderRadius:12}}>{busy?"جارٍ التحقق...":"دخول"}</button></form></section></main>;
}
