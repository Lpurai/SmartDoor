import { supabase } from '../data/supabaseClient';
import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  UserPlus, 
  Users, 
  Activity, 
  TrendingUp, 
  LogOut, 
  KeyRound, 
  Trash2, 
  Settings, 
  Mail, 
  Lock, 
  Sliders 
} from 'lucide-react';

const Dashboard = () => {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false); // FIXED: Added missing state
  
  // App Core Application States
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState([]);
  
  // Profile Provisioning States
  const [editingUserId, setEditingUserId] = useState(null);
  const [username, setUsername] = useState('');
  const [rfidUid, setRfidUid] = useState('');
  const [adminPin, setAdminPin] = useState(''); // FIXED: Restored dedicated custom admin override PIN state
  const [globalSharedPin, setGlobalSharedPin] = useState('1230'); 
  const [isUserAdminRole, setIsUserAdminRole] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchInitialData();
      const logChannel = supabase
        .channel('schema-db-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_logs' }, () => {
          fetchInitialData();
        })
        .subscribe();
      return () => supabase.removeChannel(logChannel);
    }
  }, [session]);

  const fetchInitialData = async () => {
    const { data: initialLogs } = await supabase.from('access_logs').select('*').order('id', { ascending: false }).limit(10);
    const { data: currentUsers } = await supabase.from('allowed_users').select('*').order('id', { ascending: false });
    const { data: settings } = await supabase.from('system_settings').select('shared_user_pin').eq('id', 1).single();
    
    if (settings) setGlobalSharedPin(settings.shared_user_pin);
    if (initialLogs) setLogs(initialLogs);
    if (currentUsers) {
      setUsers(currentUsers);
      calculateUserFrequency(currentUsers, initialLogs);
    }
  };

  const calculateUserFrequency = async (currentUsers) => {
    const { data: allLogs } = await supabase.from('access_logs').select('*');
    if (!allLogs) return;

    const frequencies = currentUsers.map(user => {
      const rfidCount = allLogs.filter(l => l.auth_method === 'RFID' && l.identifier_used === user.rfid_uid && l.status === 'UNLOCK').length;
      const adminPinCount = user.role === 'admin' ? allLogs.filter(l => l.auth_method === 'KEYPAD' && l.identifier_used === `ADMIN_${user.username}` && l.status === 'UNLOCK').length : 0;
      
      return {
        username: user.username,
        role: user.role,
        totalPasses: rfidCount + adminPinCount
      };
    });
    setStats(frequencies);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(`Sign Up Failed: ${error.message}`);
    else {
      alert("Registration Successful!");
      setIsSigningUp(false);
    }
  };

  const handleLogout = () => supabase.auth.signOut();

  const handleCreateOrUpdateUser = async (e) => {
    e.preventDefault();
    if (!username) return alert('Name required');

    const payload = {
      username,
      rfid_uid: rfidUid ? rfidUid.toUpperCase() : null,
      role: isUserAdminRole ? 'admin' : 'user',
      pin_code: isUserAdminRole ? adminPin : null 
    };

    if (editingUserId) {
      const { error } = await supabase.from('allowed_users').update(payload).eq('id', editingUserId);
      if (error) alert(error.message);
      setEditingUserId(null);
    } else {
      const { error } = await supabase.from('allowed_users').insert([payload]);
      if (error) alert(error.message);
    }

    setUsername('');
    setRfidUid('');
    setAdminPin('');
    setIsUserAdminRole(false);
    fetchInitialData();
  };

  const startEdit = (user) => {
    setEditingUserId(user.id);
    setUsername(user.username);
    setRfidUid(user.rfid_uid || '');
    setAdminPin(user.pin_code || '');
    setIsUserAdminRole(user.role === 'admin');
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm("Permanently revoke access for this profile?")) {
      const { error } = await supabase.from('allowed_users').delete().eq('id', id);
      if (error) alert(error.message);
      fetchInitialData();
    }
  };

  const handleUpdateGlobalPin = async (e) => {
    e.preventDefault();
    if (globalSharedPin.length !== 4) return alert("PIN must be exactly 4 digits");

    const { error } = await supabase
      .from('system_settings')
      .update({ shared_user_pin: globalSharedPin })
      .eq('id', 1);

    if (error) alert(`Failed to update system PIN: ${error.message}`);
    else alert("Global User PIN updated successfully across all endpoints!");
  };

  // --- LOGIN PANEL PORTAL ---
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl w-full max-w-md shadow-2xl">
          <div className="flex items-center space-x-2 text-emerald-400 mb-2">
            <Shield className="h-6 w-6" />
            <h2 className="text-xl font-bold tracking-wider font-mono">
              GATEWATCH // {isSigningUp ? "REGISTER" : "PORTAL"}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-6">Secure credential system authority check.</p>
          
          <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4 mb-6">
            <div>
              <label className="text-xs uppercase text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email Address
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" required />
            </div>
            <div>
              <label className="text-xs uppercase text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Password Keyphrase
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" required />
            </div>
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 rounded transition shadow">
              {isSigningUp ? "Create Admin Profile" : "Establish Auth Session"}
            </button>
          </form>

          <div className="border-t border-slate-900 pt-4 text-center">
            <button onClick={() => { setIsSigningUp(!isSigningUp); setEmail(''); setPassword(''); }} className="text-xs text-slate-400 hover:text-emerald-400 transition underline decoration-dotted">
              {isSigningUp ? "Already authorized? Log In" : "Need master access? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- AUTHENTICATED DASHBOARD ---
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-bold tracking-wider text-emerald-400 font-mono flex items-center gap-2">
            <Shield className="h-5 w-5" />  CONTROL NODE
          </h1>
        </div>
        <button onClick={handleLogout} className="text-xs bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 font-semibold px-4 py-1.5 rounded transition border border-slate-700 flex items-center gap-2">
          <LogOut className="h-3.5 w-3.5" />Log Out
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <div className="space-y-6">
          {/* Provision Form */}
          <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 mb-4 uppercase font-mono flex items-center gap-2">
              {editingUserId ? <Settings className="h-4 w-4 text-amber-400" /> : <UserPlus className="h-4 w-4 text-emerald-400" />}
              {editingUserId ? "Modify User Scope" : "Provision Profile"}
            </h2>
            <form onSubmit={handleCreateOrUpdateUser} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-slate-400 font-medium mb-1">User Identifier Name</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. John Doe" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs uppercase text-slate-400 font-medium mb-1">Hardware Card UID</label>
                <input type="text" value={rfidUid} onChange={e => setRfidUid(e.target.value)} placeholder="e.g. A3B2C5D1" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" />
              </div>
              
              <div className="bg-slate-900 p-3 rounded border border-slate-800 flex items-center justify-between">
                <span className="text-xs uppercase font-medium text-slate-400">Grant System Admin Role?</span>
                <input type="checkbox" checked={isUserAdminRole} onChange={e => setIsUserAdminRole(e.target.checked)} className="h-4 w-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 focus:ring-offset-0" />
              </div>

              {isUserAdminRole && (
                <div>
                  <label className="block text-xs uppercase text-slate-400 font-medium mb-1 text-amber-400 flex items-center gap-1">
                    <KeyRound className="h-3 w-3" /> Custom Admin Override PIN (4-Digits)
                  </label>
                  <input type="text" maxLength="4" value={adminPin} onChange={e => setAdminPin(e.target.value)} placeholder="e.g. 9999" className="w-full bg-slate-900 border border-amber-600/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400 font-mono" />
                </div>
              )}

              <div className="flex space-x-2 pt-2">
                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2 rounded shadow transition">
                  {editingUserId ? "Apply Schema Changes" : "Authorize Profile"}
                </button>
                {editingUserId && (
                  <button type="button" onClick={() => { setEditingUserId(null); setUsername(''); setRfidUid(''); setAdminPin(''); setIsUserAdminRole(false); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-3 rounded">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Traffic Reports Box */}
          <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 mb-4 uppercase font-mono flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> User Traffic Analysis
            </h2>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-2">
              {stats.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-900 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-300 font-medium">{item.username}</span>
                    {item.role === 'admin' && <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 rounded font-mono border border-amber-500/20">ADMIN</span>}
                  </div>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold">
                    {item.totalPasses} Passes
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Global System Settings Card Component */}
          <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 mb-4 uppercase font-mono flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-400" /> System Configurations
            </h2>
            <form onSubmit={handleUpdateGlobalPin} className="space-y-3">
              <div>
                <label className="block text-xs uppercase text-slate-400 font-medium mb-1">
                  Shared Student Entry PIN
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    maxLength="4" 
                    value={globalSharedPin} 
                    onChange={e => setGlobalSharedPin(e.target.value)} 
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500" 
                  />
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-1.5 rounded transition shadow">
                    Update
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Changing this updates the entrance criteria for all standard accounts instantly.</p>
              </div>
            </form>
          </section>
        </div>

        {/* Database Users Inventory Grid */}
        <div className="xl:col-span-2 space-y-6">
          <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 mb-3 uppercase font-mono flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" /> System Credentials Registry
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="py-2 font-semibold">User</th>
                    <th className="py-2 font-semibold">Role</th>
                    <th className="py-2 font-semibold">Card UID</th>
                    <th className="py-2 font-semibold">Auth Method</th>
                    <th className="py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 font-medium text-slate-200">{u.username}</td>
                      <td className="py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-amber-400/10 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                          {u.role ? u.role.toUpperCase() : 'USER'}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-slate-400">{u.rfid_uid || '---'}</td>
                      <td className="py-3 text-xs text-slate-400 font-mono">
                        {u.role === 'admin' ? "RFID + Custom PIN" : "RFID + Shared PIN"}
                      </td>
                      <td className="py-3 text-right space-x-2">
                        <button onClick={() => startEdit(u)} className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 px-2.5 py-1 rounded transition border border-slate-700">Modify</button>
                        <button onClick={() => handleDeleteUser(u.id)} className="text-xs bg-slate-800 hover:bg-rose-950 text-rose-400 px-2.5 py-1 rounded transition border border-slate-700 flex-inline items-center"><Trash2 className="h-3 w-3 inline mr-1" /> Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Audit Trail Section */}
          <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm max-h-80 overflow-y-auto">
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 mb-4 uppercase font-mono flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" /> Live Entry Audit Stream
            </h2>
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex justify-between items-center text-xs">
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-0.5 rounded font-bold font-mono ${log.status === 'UNLOCK' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {log.status === 'UNLOCK' ? 'GRANTED' : 'DENIED'}
                    </span>
                    <div>
                      <span className="text-slate-300">Method: <strong className="text-slate-100 font-mono">{log.auth_method}</strong></span>
                      <p className="text-slate-500 font-mono text-[10px]">Token: {log.identifier_used || 'N/A'}</p>
                    </div>
                  </div>
                  <span className="text-slate-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

      </main>
    </div>
  );
};

export default Dashboard;