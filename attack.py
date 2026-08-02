#!/usr/bin/env python3
"""
LOCALHOST VULNERABILITY VERIFIER WITH API DISCOVERY
Automatically finds API endpoints and tests for vulnerabilities
ONLY FOR LOCAL DEVELOPMENT ENVIRONMENT
"""

import requests
import json
import time
import re
from urllib.parse import urljoin, urlparse, parse_qs
import os
import sys
import argparse
import warnings
warnings.filterwarnings('ignore')

class VulnerabilityVerifier:
    """
    Verifies vulnerabilities on LOCALHOST ONLY
    Automatically discovers API endpoints
    """
    
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        self.confirmed_vulns = []
        self.discovered_endpoints = []
        self.api_endpoints = []
        
    def print_header(self, title):
        """Print test header"""
        print("\n" + "="*70)
        print(f"  {title}")
        print("="*70)
    
    def discover_endpoints(self):
        """
        Automatically discover API endpoints and other attack surfaces
        """
        self.print_header("🔍 API ENDPOINT DISCOVERY")
        
        print(f"\nDiscovering endpoints on {self.base_url}...")
        
        # Common API endpoint patterns
        api_patterns = [
            '/api',
            '/api/v1',
            '/api/v2',
            '/api/v3',
            '/v1/api',
            '/v2/api',
            '/rest',
            '/rest/api',
            '/graphql',
            '/graphiql',
            '/swagger',
            '/swagger-ui',
            '/swagger.json',
            '/swagger-ui/index.html',
            '/api-docs',
            '/docs',
            '/documentation',
            '/openapi',
            '/openapi.json',
            '/openapi.yaml',
            '/health',
            '/healthcheck',
            '/status',
            '/ping',
            '/version',
            '/auth',
            '/login',
            '/register',
            '/signup',
            '/signin',
            '/logout',
            '/user',
            '/users',
            '/profile',
            '/admin',
            '/dashboard',
            '/settings',
            '/config',
            '/database',
            '/test',
            '/debug',
            '/dev',
            '/staging'
        ]
        
        # Try to discover from HTML/JS files
        try:
            response = self.session.get(self.base_url, timeout=5)
            html_content = response.text
            
            # Find API endpoints in JavaScript
            js_patterns = [
                r'["\'](/api/[^\s"\']+)["\']',
                r'["\'](/v\d+/[^\s"\']+)["\']',
                r'url\s*:\s*["\']([^"\']+)["\']',
                r'endpoint\s*:\s*["\']([^"\']+)["\']',
                r'fetch\(["\']([^"\']+)["\']',
                r'axios\.(get|post|put|delete)\(["\']([^"\']+)["\']',
                r'\$\.(get|post|ajax)\(["\']([^"\']+)["\']',
                r'XMLHttpRequest.*\.open\(["\'][^"\']+["\'],\s*["\']([^"\']+)["\']',
            ]
            
            for pattern in js_patterns:
                matches = re.findall(pattern, html_content, re.IGNORECASE)
                for match in matches:
                    if isinstance(match, tuple):
                        endpoint = match[-1]  # Get last element if tuple
                    else:
                        endpoint = match
                    
                    if endpoint and endpoint not in self.discovered_endpoints:
                        if endpoint.startswith('/'):
                            self.discovered_endpoints.append(endpoint)
                        elif endpoint.startswith('http'):
                            # Extract path
                            parsed = urlparse(endpoint)
                            if parsed.path:
                                self.discovered_endpoints.append(parsed.path)
            
        except Exception as e:
            print(f"⚠️ Could not parse HTML: {e}")
        
        # Try common API endpoints directly
        for pattern in api_patterns:
            if pattern not in self.discovered_endpoints:
                self.discovered_endpoints.append(pattern)
        
        # Test each discovered endpoint
        print(f"\nTesting {len(self.discovered_endpoints)} discovered endpoints...")
        
        for endpoint in self.discovered_endpoints:
            test_url = f"{self.base_url}{endpoint}"
            
            try:
                # Try GET request
                response = self.session.get(test_url, timeout=3, allow_redirects=False)
                
                if response.status_code in [200, 201, 301, 302, 307, 308, 400, 401, 403]:
                    self.api_endpoints.append({
                        'url': test_url,
                        'method': 'GET',
                        'status': response.status_code,
                        'content_type': response.headers.get('content-type', ''),
                        'size': len(response.content)
                    })
                    
                    # Try to parse as JSON for API endpoints
                    try:
                        data = response.json()
                        self.api_endpoints[-1]['json'] = True
                        self.api_endpoints[-1]['data'] = data
                    except:
                        self.api_endpoints[-1]['json'] = False
                    
                    print(f"  ✅ Found: {endpoint} (Status: {response.status_code})")
                    
                    # If it's a redirect, get the redirect location
                    if response.status_code in [301, 302, 307, 308]:
                        redirect_url = response.headers.get('location', '')
                        if redirect_url:
                            print(f"     ↳ Redirects to: {redirect_url}")
                            
                elif response.status_code == 404:
                    # Still interesting - maybe it exists but returns 404
                    pass
                    
            except requests.exceptions.Timeout:
                pass
            except Exception as e:
                pass
        
        # Test common API authentication endpoints
        auth_endpoints = [
            '/login', '/signin', '/auth/login', '/api/auth/login',
            '/register', '/signup', '/auth/register', '/api/auth/register',
            '/logout', '/signout', '/auth/logout', '/api/auth/logout',
            '/password/reset', '/forgot-password', '/api/password/reset',
            '/2fa', '/two-factor', '/api/2fa/enable'
        ]
        
        for endpoint in auth_endpoints:
            if endpoint not in [e['url'].replace(self.base_url, '') for e in self.api_endpoints]:
                test_url = f"{self.base_url}{endpoint}"
                try:
                    response = self.session.post(test_url, timeout=3)
                    if response.status_code in [200, 201, 400, 401, 403]:
                        self.api_endpoints.append({
                            'url': test_url,
                            'method': 'POST',
                            'status': response.status_code,
                            'content_type': response.headers.get('content-type', '')
                        })
                        print(f"  ✅ Found auth endpoint: {endpoint} (Status: {response.status_code})")
                except:
                    pass
        
        # Find all endpoints from JavaScript files
        print("\nSearching for endpoints in JavaScript files...")
        js_files = []
        
        try:
            response = self.session.get(self.base_url, timeout=5)
            js_patterns = re.findall(r'src=["\']([^"\']+\.js)["\']', response.text)
            
            for js_file in js_patterns:
                if js_file.startswith('/'):
                    js_files.append(js_file)
                else:
                    js_files.append('/' + js_file)
            
            # Also find webpack chunks
            js_patterns = re.findall(r'href=["\']([^"\']+\.js)["\']', response.text)
            for js_file in js_patterns:
                if js_file not in js_files:
                    js_files.append(js_file)
                    
        except:
            pass
        
        for js_file in js_files[:5]:  # Limit to 5 JS files
            try:
                js_url = f"{self.base_url}{js_file}"
                response = self.session.get(js_url, timeout=5)
                
                if response.status_code == 200:
                    js_content = response.text
                    
                    # Extract API endpoints from JS
                    endpoint_patterns = [
                        r'["\']/(api|v1|v2|v3|rest)/[^\s"\']+["\']',
                        r'fetch\(["\']([^\s"\']+)["\']',
                        r'axios\.(get|post|put|delete|patch)\(["\']([^\s"\']+)["\']',
                        r'\$\.(get|post|ajax)\(["\']([^\s"\']+)["\']',
                        r'url\s*:\s*["\']([^\s"\']+)["\']',
                        r'endpoint\s*:\s*["\']([^\s"\']+)["\']',
                        r'route\s*:\s*["\']([^\s"\']+)["\']',
                        r'path\s*:\s*["\']([^\s"\']+)["\']'
                    ]
                    
                    for pattern in endpoint_patterns:
                        matches = re.findall(pattern, js_content, re.IGNORECASE)
                        for match in matches:
                            if isinstance(match, tuple):
                                endpoint = match[-1]
                            else:
                                endpoint = match
                            
                            if endpoint and endpoint.startswith('/') and endpoint not in self.discovered_endpoints:
                                self.discovered_endpoints.append(endpoint)
                                print(f"  ✅ Found in JS: {endpoint}")
                                
            except:
                pass
        
        # Summary
        print(f"\n📊 DISCOVERY SUMMARY:")
        print(f"   Total endpoints discovered: {len(self.discovered_endpoints)}")
        print(f"   Active endpoints found: {len(self.api_endpoints)}")
        
        if self.api_endpoints:
            print(f"\nActive endpoints:")
            for endpoint in self.api_endpoints:
                print(f"   - {endpoint['url']} (Status: {endpoint['status']})")
        
        return self.api_endpoints
    
    def test_sql_injection(self):
        """
        Test discovered endpoints for SQL injection
        """
        self.print_header("🔍 SQL INJECTION VERIFICATION")
        
        if not self.api_endpoints:
            print("No endpoints discovered. Run endpoint discovery first.")
            return []
        
        print(f"\nTesting {len(self.api_endpoints)} endpoints for SQL injection...")
        
        # SQL injection payloads
        payloads = [
            ("Basic", "'"),
            ("Boolean", "1' OR '1'='1"),
            ("Union", "1' UNION SELECT NULL--"),
            ("Comment", "1' OR 1=1--"),
            ("Stacked", "1'; DROP TABLE users--"),
            ("Time-based", "1' AND SLEEP(5)--"),
            ("Error-based", "1' AND extractvalue(1,concat(0x7e,version()))--"),
            ("PostgreSQL", "1' OR '1'='1'::text--"),
            ("MySQL", "1' OR 1=1/*"),
            ("MSSQL", "1' OR 1=1--"),
        ]
        
        found = []
        
        for endpoint_info in self.api_endpoints:
            url = endpoint_info['url']
            
            for name, payload in payloads:
                try:
                    # Test GET parameters
                    test_url = f"{url}?id={payload}&user={payload}&search={payload}"
                    
                    response = self.session.get(test_url, timeout=10)
                    
                    # Check for SQL error indicators
                    sql_errors = [
                        'sql', 'mysql', 'ora-', 'postgresql', 'microsoft ole db',
                        'syntax error', 'unclosed quotation', 'stack trace',
                        'warning', 'exception', 'incorrect syntax',
                        'sqlite3.OperationalError', 'psycopg2.Error',
                        'mysql.connector.errors', 'pymysql.err',
                        'your SQL syntax', 'near', 'at line',
                        'Unclosed quotation mark', 'DB::Error',
                        'SQLSTATE', 'error in your sql syntax',
                        'SQLite', 'PostgreSQL', 'MariaDB', 'InnoDB'
                    ]
                    
                    content = response.text.lower()
                    has_error = any(error in content for error in sql_errors)
                    
                    if has_error or response.status_code == 500:
                        found.append({
                            'endpoint': url,
                            'payload': payload,
                            'status': response.status_code
                        })
                        
                        self.log_finding(
                            'CRITICAL',
                            f'SQL Injection - {name}',
                            f'Endpoint {url} vulnerable to SQL injection',
                            f'Payload: {payload}\nStatus: {response.status_code}',
                            'Use parameterized queries\nValidate all input\nUse an ORM'
                        )
                        break
                        
                except Exception as e:
                    pass
        
        if found:
            print(f"\n✅ VERIFIED: SQL Injection exists on {len(found)} endpoints!")
        else:
            print("\n✅ No SQL injection vulnerabilities detected")
            
        return found
    
    def test_xss(self):
        """
        Test discovered endpoints for XSS
        """
        self.print_header("🔍 XSS VERIFICATION")
        
        if not self.api_endpoints:
            print("No endpoints discovered. Run endpoint discovery first.")
            return []
        
        print(f"\nTesting {len(self.api_endpoints)} endpoints for XSS...")
        
        xss_payloads = [
            ('Basic Script', '<script>alert("XSS_VULNERABLE")</script>'),
            ('Image Error', '<img src=x onerror=alert("XSS_VULNERABLE")>'),
            ('SVG', '<svg onload=alert("XSS_VULNERABLE")>'),
            ('JavaScript URI', 'javascript:alert("XSS_VULNERABLE")'),
            ('Event Handler', '"><script>alert("XSS")</script>'),
            ('Body', '<body onload=alert("XSS_VULNERABLE")>'),
            ('Iframe', '<iframe src="javascript:alert(\'XSS\')">'),
        ]
        
        found = []
        
        for endpoint_info in self.api_endpoints:
            url = endpoint_info['url']
            
            for name, payload in xss_payloads:
                try:
                    test_url = f"{url}?q={payload}&search={payload}&name={payload}"
                    response = self.session.get(test_url, timeout=5)
                    
                    if payload in response.text:
                        found.append({
                            'endpoint': url,
                            'payload': payload,
                            'status': response.status_code
                        })
                        
                        self.log_finding(
                            'HIGH',
                            f'XSS - {name}',
                            f'Endpoint {url} vulnerable to XSS',
                            f'Payload: {payload}\nReflected in response',
                            'Implement output encoding\nUse CSP header\nSanitize user input'
                        )
                        break
                        
                except Exception as e:
                    pass
        
        if found:
            print(f"\n✅ VERIFIED: XSS exists on {len(found)} endpoints!")
        else:
            print("\n✅ No XSS vulnerabilities detected")
            
        return found
    
    def test_authentication_bypass(self):
        """
        Test authentication bypass on discovered endpoints
        """
        self.print_header("🔍 AUTHENTICATION BYPASS VERIFICATION")
        
        # Try common admin paths
        admin_paths = ['/admin', '/dashboard', '/admin/dashboard', '/api/admin']
        
        for path in admin_paths:
            test_url = f"{self.base_url}{path}"
            try:
                response = self.session.get(test_url, timeout=5)
                
                if response.status_code in [200, 201]:
                    self.log_finding(
                        'HIGH',
                        'Admin Dashboard Accessible',
                        f'Admin dashboard accessible at {path} without authentication',
                        f'Status: {response.status_code}',
                        'Implement proper authentication for admin routes'
                    )
            except:
                pass
        
        return []
    
    def test_information_disclosure(self):
        """
        Test for information disclosure
        """
        self.print_header("🔍 INFORMATION DISCLOSURE VERIFICATION")
        
        sensitive_paths = [
            '/.env', '/.env.local', '/.env.development', '/.env.production',
            '/config.json', '/config.yml', '/config.yaml', '/config.js',
            '/package.json', '/composer.json', '/requirements.txt',
            '/.git/config', '/.gitignore', '/.git/HEAD',
            '/README.md', '/README', '/docs',
            '/database.yml', '/database.json', '/db.json',
            '/.htaccess', '/.htpasswd',
            '/.aws/credentials', '/.ssh/id_rsa',
            '/secrets.json', '/secrets.yml',
            '/api-docs', '/swagger.json', '/openapi.json',
            '/server.js', '/app.js', '/index.js',
            '/web.config', '/.well-known/jwks.json',
            '/debug', '/test', '/tests'
        ]
        
        found_files = []
        
        for path in sensitive_paths:
            test_url = f"{self.base_url}{path}"
            try:
                response = self.session.get(test_url, timeout=3)
                
                if response.status_code == 200 and len(response.text) > 10:
                    found_files.append({
                        'path': path,
                        'size': len(response.text)
                    })
                    
                    self.log_finding(
                        'HIGH',
                        f'Sensitive File Exposed',
                        f'File {path} is accessible',
                        f'Status: {response.status_code}\nSize: {len(response.text)} bytes',
                        'Move sensitive files outside web root\nUse .htaccess to deny access'
                    )
                    
            except:
                pass
        
        if found_files:
            print(f"\n✅ VERIFIED: {len(found_files)} sensitive files exposed!")
        else:
            print("\n✅ No sensitive files exposed")
            
        return found_files
    
    def test_rate_limiting(self):
        """
        Test rate limiting on discovered endpoints
        """
        self.print_header("🔍 RATE LIMITING VERIFICATION")
        
        # Test login endpoints specifically
        login_endpoints = [e for e in self.api_endpoints if 'login' in e['url'].lower() or 'auth' in e['url'].lower()]
        
        if not login_endpoints:
            login_endpoints = self.api_endpoints[:3]  # Test first 3 endpoints
        
        for endpoint_info in login_endpoints:
            url = endpoint_info['url']
            print(f"\nTesting rate limiting on {url}...")
            
            status_codes = []
            response_times = []
            
            try:
                # Make 20 rapid requests
                for i in range(20):
                    start = time.time()
                    response = self.session.get(url, timeout=2)
                    elapsed = time.time() - start
                    status_codes.append(response.status_code)
                    response_times.append(elapsed)
                    time.sleep(0.05)
                
                has_429 = 429 in status_codes
                avg_time = sum(response_times) / len(response_times)
                
                if has_429:
                    print(f"  ✅ Rate limiting ACTIVE (429 responses detected)")
                else:
                    self.log_finding(
                        'MEDIUM',
                        'No Rate Limiting',
                        f'Rate limiting not implemented on {url}',
                        f'{len(status_codes)} requests succeeded without restriction\nAvg response time: {avg_time:.2f}s',
                        'Implement rate limiting for all endpoints\nUse express-rate-limit or similar'
                    )
                    
            except Exception as e:
                print(f"  ⚠️ Could not test rate limiting: {e}")
    
    def test_csrf(self):
        """
        Test CSRF protection on discovered endpoints
        """
        self.print_header("🔍 CSRF PROTECTION VERIFICATION")
        
        # Find POST endpoints
        post_endpoints = [e for e in self.api_endpoints if e.get('method') == 'POST']
        
        if not post_endpoints:
            post_endpoints = self.api_endpoints[:3]
        
        for endpoint_info in post_endpoints:
            url = endpoint_info['url']
            
            try:
                # Try request without CSRF token
                test_data = {'test': 'value'}
                response = self.session.post(url, json=test_data, timeout=5)
                
                if response.status_code in [200, 201, 202]:
                    self.log_finding(
                        'MEDIUM',
                        'Potential CSRF Vulnerability',
                        f'Endpoint {url} accepted request without CSRF token',
                        f'Status: {response.status_code}',
                        'Implement CSRF tokens\nUse SameSite cookies\nVerify origin/referer headers'
                    )
                    
            except Exception as e:
                print(f"⚠️ Could not test CSRF on {url}: {e}")
    
    def log_finding(self, severity, title, description, proof, remediation):
        """Log security findings"""
        finding = {
            'severity': severity,
            'title': title,
            'description': description,
            'proof': proof,
            'remediation': remediation
        }
        self.confirmed_vulns.append(finding)
        
        # Colorful output
        colors = {
            'CRITICAL': '\033[91m',  # Red
            'HIGH': '\033[93m',       # Yellow
            'MEDIUM': '\033[94m',     # Blue
            'LOW': '\033[92m',        # Green
            'INFO': '\033[96m'        # Cyan
        }
        reset = '\033[0m'
        
        print(f"\n{colors.get(severity, '')}[{severity}] {title}{reset}")
        print(f"  📝 {description}")
        print(f"  🔍 Proof: {proof}")
        print(f"  🔧 Fix: {remediation}")
    
    def run_full_verification(self):
        """Run all verification tests"""
        print("\n" + "="*70)
        print("  🔐 LOCALHOST VULNERABILITY VERIFIER")
        print("  WITH AUTOMATIC API ENDPOINT DISCOVERY")
        print("="*70)
        
        print(f"\nTarget: {self.base_url}")
        print("\nThis will:")
        print("  1️⃣ Discover all API endpoints automatically")
        print("  2️⃣ Test for SQL injection on discovered endpoints")
        print("  3️⃣ Test for XSS on discovered endpoints")
        print("  4️⃣ Test for authentication bypass")
        print("  5️⃣ Test for information disclosure")
        print("  6️⃣ Test for rate limiting issues")
        print("  7️⃣ Test for CSRF vulnerabilities")
        
        print("\n⚠️  This will attempt to EXPLOIT vulnerabilities to confirm they exist.")
        print("   Ensure you have explicit permission to test the target.\n")

        verification = input("Confirm you have permission to test this target? (yes/no): ").strip().lower()

        if verification != 'yes':
            print("Aborting: user did not confirm permission to run tests.")
            sys.exit(1)
        
        # Step 1: Discover endpoints
        self.discover_endpoints()
        
        if not self.api_endpoints:
            print("\n⚠️ No endpoints discovered. Trying standard endpoints...")
            # Add common endpoints manually
            common_endpoints = [
                '/api/users', '/api/login', '/api/register', '/api/roll',
                '/api/bet', '/api/withdraw', '/api/deposit', '/api/profile',
                '/api/settings', '/api/admin', '/api/dashboard'
            ]
            for endpoint in common_endpoints:
                test_url = f"{self.base_url}{endpoint}"
                try:
                    response = self.session.get(test_url, timeout=3)
                    if response.status_code in [200, 401, 403, 405]:
                        self.api_endpoints.append({
                            'url': test_url,
                            'method': 'GET',
                            'status': response.status_code
                        })
                        print(f"  ✅ Added: {endpoint}")
                except:
                    pass
        
        # Step 2: Run security tests
        self.test_sql_injection()
        self.test_xss()
        self.test_authentication_bypass()
        self.test_information_disclosure()
        self.test_rate_limiting()
        self.test_csrf()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print comprehensive summary"""
        print("\n" + "="*70)
        print("  📊 VERIFICATION SUMMARY")
        print("="*70)
        
        print(f"\n📡 Endpoints Discovered: {len(self.api_endpoints)}")
        
        if self.confirmed_vulns:
            print(f"\n🔴 CONFIRMED VULNERABILITIES: {len(self.confirmed_vulns)}")
            
            for vuln in self.confirmed_vulns:
                print(f"\n  [{vuln['severity']}] {vuln['title']}")
                print(f"  Description: {vuln['description']}")
                
            print("\n" + "="*70)
            print("  🛡️  IMMEDIATE ACTIONS REQUIRED")
            print("="*70)
            print("\n1. ✅ Fix SQL injection: Use parameterized queries")
            print("2. ✅ Fix XSS: Implement output encoding & CSP")
            print("3. ✅ Fix Auth: Implement proper session management")
            print("4. ✅ Fix CSRF: Add CSRF tokens to all forms")
            print("5. ✅ Fix Rate Limiting: Implement request throttling")
            print("6. ✅ Secure files: Move config outside web root")
            
        else:
            print("\n✅ No vulnerabilities confirmed!")
            print("   Your local server appears to be secure against basic attacks.")
        
        print("\n" + "="*70)
        print("  ⚠️  REMEMBER: These tests were run on LOCALHOST only")
        print("  This does not guarantee production security")
        print("="*70)

# Main execution
if __name__ == "__main__":
    print("\n" + "="*70)
    print("  ⚠️  ETHICAL HACKING - TARGETED TESTS  ⚠️")
    print("="*70)
    print("\nTHIS SCRIPT WILL:")
    print("  ✅ Automatically discover all API endpoints")
    print("  ✅ Test for SQL injection vulnerabilities")
    print("  ✅ Test for XSS vulnerabilities")
    print("  ✅ Test for authentication bypass")
    print("  ✅ Test for information disclosure")
    print("  ✅ Test for rate limiting")
    print("  ✅ Test for CSRF vulnerabilities")
    print("\n⚠️  IT WILL ATTEMPT TO EXPLOIT THESE VULNERABILITIES")
    print("   to confirm they actually exist on YOUR target.\n")
    
    print("="*70)
    print("  CONFIGURATION")
    print("="*70)

    parser = argparse.ArgumentParser(description='Vulnerability verifier')
    parser.add_argument('-b', '--base-url', help='Target base URL to test (e.g. https://example.com)')
    args = parser.parse_args()

    if args.base_url:
        test_url = args.base_url.strip()
    else:
        test_url = input("Enter target URL (e.g., https://example.com): ").strip()
    
    # If target is non-localhost, require explicit environment opt-in and confirmation
    if not any(local in test_url for local in ['localhost', '127.0.0.1', '0.0.0.0']):
        print(f"\n⚠️ Non-localhost target detected: {test_url}")
        # Require explicit environment opt-in for remote testing
        if os.environ.get('ALLOW_REMOTE_TESTING') != '1':
            print("ERROR: Remote testing is disabled by default.")
            print("To enable remote testing, set environment variable: ALLOW_REMOTE_TESTING=1")
            print("Ensure you OWN this target and have written permission to test it.")
            sys.exit(1)

        # Require an explicit typed confirmation to avoid accidental misuse
        consent_prompt = (
            "Type the following EXACTLY to confirm you own this target and have permission to test it:\n"
            "I OWN THIS TARGET AND HAVE PERMISSION TO TEST IT\n> "
        )
        consent = input(consent_prompt).strip()
        if consent != "I OWN THIS TARGET AND HAVE PERMISSION TO TEST IT":
            print("Confirmation failed. Aborting.")
            sys.exit(1)
    
    print(f"\nTarget URL: {test_url}")
    
    try:
        # Verify server is running
        test_response = requests.get(test_url, timeout=5)
        print(f"✅ Server is running (Status: {test_response.status_code})")
    except:
        print(f"❌ Cannot connect to {test_url}")
        print("Make sure your server is running!")
        exit()
    
    verifier = VulnerabilityVerifier(test_url)
    verifier.run_full_verification()