#!/usr/bin/env python3

import json
import time
import ipaddress
import subprocess
import os
from datetime import datetime
from collections import deque, defaultdict
from flask import Flask, request, jsonify
import threading
import signal
import sys
import requests

class DDoSDetectionEngine:
    def __init__(self):
        self.stats = {}
        self.blocked_ips = set()
        self.whitelisted_ips = {'127.0.0.1', '::1', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'}
        self.global_metrics = {
            'total_requests': 0, 
            'unique_ips': set(), 
            'start_time': time.time(),
            'endpoint_requests': defaultdict(int)
        }
        self.rate_limit = 20
        self.rate_window = 60
        self.block_duration = 1800
        self.is_under_attack = False
        self.attack_start_time = None
        self.attack_history = deque(maxlen=100)
        self.flood_actions = []
        
        self.TARGET_URL = 'https://www.bloxybattles.com'
        
        self.ACTION_BLOCK = True
        self.ACTION_RATE_LIMIT = True
        self.ACTION_LOG = True
        self.ACTION_ALERT = True
        self.ACTION_CHALLENGE = True
        self.ACTION_THROTTLE = True
        self.ACTION_BLACKLIST = True
        
        self.is_windows = sys.platform.startswith('win')
        
        try:
            self.public_ip = requests.get('https://api.ipify.org', timeout=5).text
            print(f"[+] Public IP: {self.public_ip}")
        except:
            self.public_ip = 'unknown'
        
        print(f"[+] DDoS Protection for {self.TARGET_URL}")
        print("[+] Monitoring all incoming traffic")
        print("[+] Flood actions enabled: BLOCK, RATE_LIMIT, LOG, ALERT, CHALLENGE, THROTTLE, BLACKLIST")
        
        self.running = True
        threading.Thread(target=self._monitor_loop, daemon=True).start()
        threading.Thread(target=self._print_status, daemon=True).start()
    
    def _take_flood_action(self, ip, flood_type, severity, details):
        actions_taken = []
        timestamp = datetime.now().isoformat()
        
        if self.ACTION_BLOCK:
            duration = 1800 if severity == 'MEDIUM' else 3600
            self.block_ip(ip, duration=duration)
            actions_taken.append(f"BLOCKED (duration: {duration}s)")
            
            if self.is_windows:
                try:
                    subprocess.run(f'netsh advfirewall firewall add rule name="Block_Flood_{ip}" dir=in action=block remoteip={ip}', 
                                 shell=True, capture_output=True)
                    actions_taken.append("SYSTEM_FIREWALL_BLOCK")
                except:
                    pass
            else:
                try:
                    subprocess.run(f'sudo iptables -A INPUT -s {ip} -j DROP', shell=True, capture_output=True)
                    actions_taken.append("SYSTEM_IPTABLES_BLOCK")
                except:
                    pass
        
        if self.ACTION_RATE_LIMIT:
            if ip in self.stats:
                self.stats[ip]['rate_limited'] = True
                self.stats[ip]['rate_limit'] = 10
                actions_taken.append("RATE_LIMITED")
        
        if self.ACTION_LOG:
            log_entry = {
                'timestamp': timestamp,
                'ip': ip,
                'flood_type': flood_type,
                'severity': severity,
                'details': details,
                'actions': actions_taken
            }
            self.flood_actions.append(log_entry)
            
            try:
                with open('flood_actions.log', 'a') as f:
                    f.write(json.dumps(log_entry) + '\n')
            except:
                pass
        
        if self.ACTION_ALERT:
            print(f"\n{'='*70}")
            print(f"[!!!] FLOOD DETECTED - ACTION TAKEN")
            print(f"[!!!] IP: {ip}")
            print(f"[!!!] Type: {flood_type}")
            print(f"[!!!] Severity: {severity}")
            print(f"[!!!] Actions: {', '.join(actions_taken)}")
            print(f"{'='*70}\n")
            
            try:
                with open('flood_alert.txt', 'a') as f:
                    f.write(f"[{timestamp}] FLOOD from {ip} - {flood_type} - Actions: {', '.join(actions_taken)}\n")
            except:
                pass
        
        if self.ACTION_CHALLENGE:
            if ip not in self.stats:
                self.stats[ip] = {'requests': deque(maxlen=1000), 'blocked_until': None}
            self.stats[ip]['challenged'] = True
            self.stats[ip]['challenge_time'] = time.time()
            actions_taken.append("CHALLENGED")
        
        if self.ACTION_THROTTLE:
            if ip not in self.stats:
                self.stats[ip] = {'requests': deque(maxlen=1000), 'blocked_until': None}
            self.stats[ip]['throttled'] = True
            self.stats[ip]['throttle_until'] = time.time() + 300
            actions_taken.append("THROTTLED")
        
        if self.ACTION_BLACKLIST:
            try:
                with open('blacklist.txt', 'a') as f:
                    f.write(f"{ip}\t{timestamp}\t{flood_type}\n")
                actions_taken.append("BLACKLISTED")
            except:
                pass
        
        self.flood_actions.append({
            'ip': ip,
            'timestamp': timestamp,
            'flood_type': flood_type,
            'severity': severity,
            'actions': actions_taken
        })
        
        return actions_taken
    
    def _monitor_loop(self):
        while self.running:
            try:
                self._check_for_attacks()
                self._cleanup()
                self._check_for_ddos_patterns()
            except Exception as e:
                print(f"[-] Monitor error: {e}")
            time.sleep(5)
    
    def _check_for_ddos_patterns(self):
        now = time.time()
        elapsed = now - self.global_metrics['start_time']
        
        if elapsed < 30:
            return
        
        endpoint_counts = defaultdict(int)
        for ip, stats in self.stats.items():
            if self.is_blocked(ip) or ip in self.whitelisted_ips:
                continue
            for endpoint, count in self.global_metrics['endpoint_requests'].items():
                if count > 10:
                    endpoint_counts[endpoint] += 1
        
        for endpoint, count in endpoint_counts.items():
            if count > 10:
                print(f"[!] DISTRIBUTED ATTACK detected on {endpoint} - {count} unique IPs")
                self.is_under_attack = True
                self.attack_start_time = self.attack_start_time or now
                
                offender_ips = []
                for ip, stats in self.stats.items():
                    if ip in self.whitelisted_ips or self.is_blocked(ip):
                        continue
                    if self.global_metrics['endpoint_requests'][endpoint] > 5:
                        offender_ips.append((ip, self.global_metrics['endpoint_requests'][endpoint]))
                
                offender_ips.sort(key=lambda x: x[1], reverse=True)
                for ip, count in offender_ips[:10]:
                    self._take_flood_action(ip, f"DISTRIBUTED_{endpoint}", "HIGH", {"count": count, "endpoint": endpoint})
    
    def _check_for_attacks(self):
        now = time.time()
        elapsed = now - self.global_metrics['start_time']
        
        if elapsed < 10:
            return
        
        request_rate = self.global_metrics['total_requests'] / elapsed
        
        if request_rate > 200:
            self.is_under_attack = True
            self.attack_start_time = self.attack_start_time or now
            print(f"[!] GLOBAL ATTACK DETECTED - Rate: {request_rate:.2f}/s")
            
            if self.ACTION_THROTTLE:
                for ip in list(self.stats.keys())[:50]:
                    if ip not in self.whitelisted_ips and not self.is_blocked(ip):
                        self.stats[ip]['throttled'] = True
                        self.stats[ip]['throttle_until'] = now + 300
            return
        
        for ip, stats in list(self.stats.items()):
            if ip in self.whitelisted_ips:
                continue
            
            recent = [t for t in stats['requests'] if now - t < self.rate_window]
            
            if len(recent) > self.rate_limit:
                flood_type = "RATE_FLOOD"
                severity = "MEDIUM"
                
                burst = [t for t in stats['requests'] if now - t < 5]
                if len(burst) > 30:
                    flood_type = "BURST_FLOOD"
                    severity = "HIGH"
                
                endpoint_counts = defaultdict(int)
                for endpoint in self.global_metrics['endpoint_requests'].keys():
                    if self.global_metrics['endpoint_requests'][endpoint] > 10:
                        endpoint_counts[endpoint] += 1
                
                if endpoint_counts:
                    flood_type = f"ENDPOINT_FLOOD_{list(endpoint_counts.keys())[0]}"
                    severity = "CRITICAL"
                
                self._take_flood_action(
                    ip, 
                    flood_type, 
                    severity, 
                    {
                        'rate': len(recent) / self.rate_window,
                        'total_requests': stats['total_requests'],
                        'endpoints': dict(endpoint_counts)
                    }
                )
                
                if severity == "CRITICAL":
                    self.block_ip(ip, duration=7200)
                    print(f"[!!!] CRITICAL FLOOD from {ip} - Blocked for 2 hours")
        
        if self.is_under_attack and request_rate < 50:
            self.is_under_attack = False
            self.attack_start_time = None
            print("[+] Attack resolved - traffic normalized")
            
            for ip in self.stats:
                if 'throttled' in self.stats[ip]:
                    self.stats[ip]['throttled'] = False
                    self.stats[ip]['throttle_until'] = None
    
    def block_ip(self, ip, duration=None):
        if ip in self.whitelisted_ips:
            return
        duration = duration or self.block_duration
        if ip not in self.stats:
            self.stats[ip] = {'requests': deque(maxlen=1000), 'blocked_until': None}
        self.stats[ip]['blocked_until'] = time.time() + duration
        self.blocked_ips.add(ip)
        self.attack_history.append({
            'ip': ip,
            'timestamp': time.time(),
            'duration': duration
        })
    
    def is_blocked(self, ip):
        if ip in self.whitelisted_ips:
            return False
        
        stats = self.stats.get(ip)
        if stats and stats.get('throttled') and stats.get('throttle_until'):
            if time.time() < stats['throttle_until']:
                return True
        
        if stats and stats.get('blocked_until'):
            if time.time() < stats['blocked_until']:
                return True
            else:
                stats['blocked_until'] = None
                self.blocked_ips.discard(ip)
        return False
    
    def record_request(self, ip, endpoint, method='GET'):
        if ip not in self.stats:
            self.stats[ip] = {'requests': deque(maxlen=1000), 'blocked_until': None}
        
        self.stats[ip]['requests'].append(time.time())
        self.global_metrics['total_requests'] += 1
        self.global_metrics['unique_ips'].add(ip)
        self.global_metrics['endpoint_requests'][endpoint] += 1
    
    def _cleanup(self):
        now = time.time()
        for ip in list(self.stats.keys()):
            if now - max(self.stats[ip]['requests']) > 3600 and not self.is_blocked(ip):
                del self.stats[ip]
    
    def _print_status(self):
        while self.running:
            time.sleep(10)
            now = time.time()
            elapsed = now - self.global_metrics['start_time']
            
            print("\n" + "="*70)
            print(f"DDOS PROTECTION STATUS - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("="*70)
            print(f"Website: {self.TARGET_URL}")
            print(f"Public IP: {self.public_ip}")
            print(f"Total Requests: {self.global_metrics['total_requests']:,}")
            print(f"Unique IPs: {len(self.global_metrics['unique_ips']):,}")
            print(f"Active IPs: {len(self.stats):,}")
            print(f"Blocked IPs: {len(self.blocked_ips):,}")
            print(f"Under Attack: {self.is_under_attack}")
            if self.is_under_attack:
                duration = now - self.attack_start_time if self.attack_start_time else 0
                print(f"Attack Duration: {duration:.0f}s")
            print(f"Request Rate: {self.global_metrics['total_requests'] / elapsed:.2f}/s")
            print(f"Flood Actions Taken: {len(self.flood_actions)}")
            
            print("\nTop 5 Endpoints:")
            sorted_endpoints = sorted(
                self.global_metrics['endpoint_requests'].items(),
                key=lambda x: x[1],
                reverse=True
            )[:5]
            for endpoint, count in sorted_endpoints:
                print(f"  {endpoint}: {count:,}")
            
            if self.blocked_ips:
                print(f"\nBlocked IPs (showing first 5):")
                for ip in list(self.blocked_ips)[:5]:
                    stats = self.stats.get(ip)
                    remaining = int(stats['blocked_until'] - now) if stats and stats.get('blocked_until') else 0
                    print(f"  {ip} (remaining: {remaining}s)")
            
            if self.flood_actions:
                print(f"\nRecent Flood Actions (last 3):")
                for action in list(self.flood_actions)[-3:]:
                    print(f"  {action['timestamp']} - {action['ip']} - {action['flood_type']} - {', '.join(action['actions'])}")
            
            print("="*70 + "\n")
    
    def get_stats(self):
        now = time.time()
        elapsed = now - self.global_metrics['start_time']
        return {
            'website': self.TARGET_URL,
            'public_ip': self.public_ip,
            'status': 'ready',
            'total_requests': self.global_metrics['total_requests'],
            'unique_ips': len(self.global_metrics['unique_ips']),
            'blocked_ips': len(self.blocked_ips),
            'is_under_attack': self.is_under_attack,
            'request_rate': self.global_metrics['total_requests'] / elapsed if elapsed > 0 else 0,
            'uptime_seconds': elapsed,
            'flood_actions_count': len(self.flood_actions)
        }
    
    def shutdown(self):
        self.running = False
        print("[+] Shutting down DDoS protection...")


app = Flask(__name__)
engine = DDoSDetectionEngine()

@app.before_request
def check_request():
    ip = request.remote_addr
    
    if request.path in ['/', '/health', '/ddos/stats', '/ddos/unblock', '/ddos/blocked', '/ddos/whitelist', '/ddos/clear']:
        return
    
    if engine.is_blocked(ip):
        print(f"[!] BLOCKED REQUEST from {ip} to {request.path}")
        return jsonify({
            'error': 'Your IP has been blocked due to suspicious activity',
            'status': 'blocked',
            'timestamp': datetime.now().isoformat()
        }), 403
    
    stats = engine.stats.get(ip)
    if stats and stats.get('challenged') and stats.get('challenge_time'):
        if time.time() - stats['challenge_time'] < 5:
            return jsonify({
                'error': 'Security challenge in progress',
                'status': 'challenged'
            }), 403
    
    engine.record_request(ip, request.path, request.method)

@app.route('/')
def index():
    return jsonify({
        'service': 'DDoS Protection System',
        'website': engine.TARGET_URL,
        'status': 'monitoring',
        'timestamp': datetime.now().isoformat(),
        'stats_url': f"http://{engine.public_ip}:4000/ddos/stats"
    })

@app.route('/health')
def health():
    stats = engine.get_stats()
    return jsonify({
        'status': 'healthy' if not stats['is_under_attack'] else 'under_attack',
        'stats': stats
    })

@app.route('/ddos/stats')
def ddos_stats():
    stats = engine.get_stats()
    stats['recent_attacks'] = [
        {
            'ip': a['ip'],
            'timestamp': datetime.fromtimestamp(a['timestamp']).isoformat(),
            'duration': a['duration']
        }
        for a in list(engine.attack_history)[-10:]
    ]
    stats['recent_flood_actions'] = engine.flood_actions[-10:]
    return jsonify(stats)

@app.route('/ddos/blocked')
def blocked_ips():
    return jsonify({
        'blocked_ips': list(engine.blocked_ips),
        'total': len(engine.blocked_ips)
    })

@app.route('/ddos/unblock', methods=['POST'])
def unblock_ip():
    data = request.get_json()
    ip = data.get('ip')
    if not ip:
        return jsonify({'error': 'IP required'}), 400
    
    if ip in engine.blocked_ips:
        engine.blocked_ips.discard(ip)
        if ip in engine.stats:
            engine.stats[ip]['blocked_until'] = None
            if 'throttled' in engine.stats[ip]:
                engine.stats[ip]['throttled'] = False
                engine.stats[ip]['throttle_until'] = None
        return jsonify({'success': True, 'ip': ip})
    return jsonify({'error': 'IP not blocked'}), 404

@app.route('/ddos/whitelist', methods=['POST'])
def whitelist_ip():
    data = request.get_json()
    ip = data.get('ip')
    if not ip:
        return jsonify({'error': 'IP required'}), 400
    
    engine.whitelisted_ips.add(ip)
    if ip in engine.blocked_ips:
        engine.blocked_ips.discard(ip)
        if ip in engine.stats:
            engine.stats[ip]['blocked_until'] = None
            if 'throttled' in engine.stats[ip]:
                engine.stats[ip]['throttled'] = False
                engine.stats[ip]['throttle_until'] = None
    
    return jsonify({'success': True, 'ip': ip})

@app.route('/ddos/whitelist', methods=['GET'])
def get_whitelist():
    return jsonify({'whitelisted_ips': list(engine.whitelisted_ips)})

@app.route('/ddos/clear', methods=['POST'])
def clear_stats():
    engine.stats.clear()
    engine.blocked_ips.clear()
    engine.attack_history.clear()
    engine.flood_actions.clear()
    engine.global_metrics['total_requests'] = 0
    engine.global_metrics['unique_ips'].clear()
    engine.global_metrics['start_time'] = time.time()
    return jsonify({'success': True})

@app.route('/ddos/actions/toggle', methods=['POST'])
def toggle_actions():
    data = request.get_json()
    action = data.get('action')
    enabled = data.get('enabled', True)
    
    if action:
        action_key = f'ACTION_{action.upper()}'
        if hasattr(engine, action_key):
            setattr(engine, action_key, enabled)
            return jsonify({'success': True, 'action': action, 'enabled': enabled})
    return jsonify({'error': 'Invalid action'}), 400

@app.route('/ddos/flood_log')
def flood_log():
    return jsonify({
        'total_actions': len(engine.flood_actions),
        'recent_actions': engine.flood_actions[-20:]
    })

if __name__ == '__main__':
    print("\n" + "="*60)
    print("BloxyBattle Overview - DDoS Blocker!")
    print("="*60)
    print(f"https://www.bloxybattles.com")
    print(f"http://{engine.public_ip}:4000")
    print("Monitoring for DDoS attacks")
    print("\nBloxyBattle Overview Logs")
    print(f"http://{engine.public_ip}:4000/ddos/stats")
    print(f"http://{engine.public_ip}:4000/health")
    print(f"http://{engine.public_ip}:4000/ddos/blocked")
    print(f"http://{engine.public_ip}:4000/ddos/flood_log")
    print("\nPress CTRL+C to stop")
    print("="*60 + "\n")
    
    def signal_handler(sig, frame):
        print("\n[+] Shutting down...")
        engine.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    app.run(host='0.0.0.0', port=4000, debug=False, threaded=True)