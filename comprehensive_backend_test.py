#!/usr/bin/env python3
"""
Comprehensive Backend API Test for Production Deployment Verification

This test specifically addresses the review request requirements:
1. Backend API Health Check - GET /api/health
2. Authentication Flow - POST /api/admin/login with admin/admin123  
3. Order Loading Performance - GET /api/admin/orders
4. Critical Endpoints - All authenticated endpoints

Usage: python comprehensive_backend_test.py
"""

import requests
import json
import time
from datetime import datetime
import os
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / 'frontend' / '.env')

# Configuration
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://orderflow-fix-4.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

class ComprehensiveBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.test_results = {}
        self.critical_errors = []
        self.total_tests = 0
        self.passed_tests = 0
    
    def log(self, message):
        """Log test messages with timestamp"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def test_endpoint(self, name, method, url, headers=None, json_data=None, expected_status=200, timeout=10):
        """Generic endpoint tester"""
        self.total_tests += 1
        
        try:
            start_time = time.time()
            
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers, timeout=timeout)
            elif method.upper() == "POST":
                response = self.session.post(url, headers=headers, json=json_data, timeout=timeout)
            elif method.upper() == "PATCH":
                response = self.session.patch(url, headers=headers, json=json_data, timeout=timeout)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response_time = round((time.time() - start_time) * 1000, 2)
            
            if response.status_code == expected_status:
                self.test_results[name] = {
                    "passed": True,
                    "status_code": response.status_code,
                    "response_time": response_time,
                    "details": f"✅ {name} successful - {response_time}ms"
                }
                self.passed_tests += 1
                self.log(f"✅ {name} PASSED ({response_time}ms)")
                return response.json() if response.content else None
            else:
                self.test_results[name] = {
                    "passed": False,
                    "status_code": response.status_code,
                    "response_time": response_time,
                    "details": f"❌ {name} failed - Expected {expected_status}, got {response.status_code}"
                }
                if response.status_code == 500:
                    self.critical_errors.append(f"{name} returning 500 error")
                self.log(f"❌ {name} FAILED ({response.status_code})")
                return None
                
        except requests.exceptions.Timeout:
            self.test_results[name] = {
                "passed": False,
                "status_code": "TIMEOUT",
                "response_time": timeout * 1000,
                "details": f"❌ {name} timed out after {timeout}s"
            }
            self.critical_errors.append(f"{name} timeout")
            self.log(f"❌ {name} TIMED OUT")
            return None
        except Exception as e:
            self.test_results[name] = {
                "passed": False,
                "status_code": "ERROR",
                "response_time": 0,
                "details": f"❌ {name} exception: {str(e)}"
            }
            self.critical_errors.append(f"{name} exception: {str(e)}")
            self.log(f"❌ {name} EXCEPTION: {e}")
            return None
    
    def run_comprehensive_tests(self):
        """Run comprehensive backend API tests"""
        self.log("=" * 80)
        self.log("🔧 COMPREHENSIVE BACKEND API TEST - PRODUCTION VERIFICATION")
        self.log("=" * 80)
        self.log(f"Testing against: {API_BASE}")
        self.log("")
        
        # 1. Health Check
        self.log("1️⃣ Testing Health Check...")
        health_data = self.test_endpoint("Health Check", "GET", f"{API_BASE}/health")
        if health_data:
            if health_data.get("status") == "healthy" and health_data.get("database") == "connected":
                self.log("   ✅ MongoDB connection verified")
            else:
                self.critical_errors.append("Health check shows system degraded")
        
        # 2. Authentication
        self.log("\n2️⃣ Testing Authentication...")
        login_data = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        auth_response = self.test_endpoint("Admin Login", "POST", f"{API_BASE}/admin/login", json_data=login_data)
        
        if auth_response and auth_response.get("success") and "token" in auth_response:
            self.admin_token = auth_response["token"]
            self.log("   ✅ JWT token obtained")
        else:
            self.critical_errors.append("Authentication failed - cannot test authenticated endpoints")
            self.log("   ❌ Cannot proceed with authenticated tests")
            return
        
        # Set up headers for authenticated requests
        auth_headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # 3. Orders Endpoints
        self.log("\n3️⃣ Testing Orders Endpoints...")
        orders_data = self.test_endpoint("Get Orders", "GET", f"{API_BASE}/admin/orders", headers=auth_headers)
        
        if orders_data and "orders" in orders_data:
            order_count = len(orders_data["orders"])
            total_count = orders_data.get("pagination", {}).get("total_count", 0)
            self.log(f"   ✅ Found {order_count} orders (Total: {total_count})")
            
            # Test order details if we have orders
            if orders_data["orders"]:
                test_order_id = orders_data["orders"][0]["id"]
                self.test_endpoint("Get Order Details", "GET", f"{API_BASE}/admin/orders/{test_order_id}", headers=auth_headers)
        
        # 4. Orders Count
        self.test_endpoint("Get Orders Count", "GET", f"{API_BASE}/admin/orders/counts", headers=auth_headers)
        
        # 5. Analytics
        self.log("\n4️⃣ Testing Analytics...")
        self.test_endpoint("Get Analytics", "GET", f"{API_BASE}/admin/analytics?days=7", headers=auth_headers)
        
        # 6. Settings Endpoints
        self.log("\n5️⃣ Testing Settings Endpoints...")
        self.test_endpoint("Get Tenant Settings", "GET", f"{API_BASE}/settings/tenant", headers=auth_headers)
        
        # 7. Workflow Endpoints
        self.log("\n6️⃣ Testing Workflow Endpoints...")
        self.test_endpoint("Get Workflow Config", "GET", f"{API_BASE}/workflow/config", headers=auth_headers)
        
        # 8. User Management
        self.log("\n7️⃣ Testing User Management...")
        self.test_endpoint("Get Users", "GET", f"{API_BASE}/users", headers=auth_headers)
        
        # 9. Vendor Management
        self.log("\n8️⃣ Testing Vendor Management...")
        self.test_endpoint("Get Vendors", "GET", f"{API_BASE}/vendors/list", headers=auth_headers)
        
        # 10. Test some edge cases
        self.log("\n9️⃣ Testing Edge Cases...")
        # Test invalid order ID
        self.test_endpoint("Invalid Order ID", "GET", f"{API_BASE}/admin/orders/invalid-id", headers=auth_headers, expected_status=404)
        
        # Test unauthorized access
        self.test_endpoint("Unauthorized Access", "GET", f"{API_BASE}/admin/orders", expected_status=401)
        
        self.log("")
        self.print_comprehensive_summary()
    
    def print_comprehensive_summary(self):
        """Print comprehensive test results"""
        self.log("=" * 80)
        self.log("📊 COMPREHENSIVE TEST RESULTS SUMMARY")
        self.log("=" * 80)
        
        # Group results by category
        categories = {
            "Core System": ["Health Check"],
            "Authentication": ["Admin Login"],
            "Orders Management": ["Get Orders", "Get Order Details", "Get Orders Count"],
            "Analytics": ["Get Analytics"],
            "Settings": ["Get Tenant Settings"],
            "Workflow": ["Get Workflow Config"],
            "User Management": ["Get Users"],
            "Vendor Management": ["Get Vendors"],
            "Edge Cases": ["Invalid Order ID", "Unauthorized Access"]
        }
        
        for category, tests in categories.items():
            self.log(f"\n📁 {category}:")
            for test_name in tests:
                if test_name in self.test_results:
                    result = self.test_results[test_name]
                    status = "✅ PASSED" if result["passed"] else "❌ FAILED"
                    response_time = f" ({result['response_time']}ms)" if result.get("response_time") else ""
                    status_code = f" [{result['status_code']}]" if result.get("status_code") else ""
                    self.log(f"  {test_name}: {status}{response_time}{status_code}")
        
        # Critical errors
        if self.critical_errors:
            self.log(f"\n🚨 CRITICAL ERRORS ({len(self.critical_errors)}):")
            for i, error in enumerate(self.critical_errors, 1):
                self.log(f"  {i}. {error}")
        
        # Performance summary
        response_times = [r["response_time"] for r in self.test_results.values() if r.get("response_time") and r["response_time"] > 0]
        if response_times:
            avg_response_time = round(sum(response_times) / len(response_times), 2)
            max_response_time = max(response_times)
            self.log(f"\n⚡ PERFORMANCE SUMMARY:")
            self.log(f"  Average Response Time: {avg_response_time}ms")
            self.log(f"  Maximum Response Time: {max_response_time}ms")
            
            if avg_response_time < 100:
                self.log("  🚀 Excellent performance!")
            elif avg_response_time < 500:
                self.log("  ✅ Good performance")
            else:
                self.log("  ⚠️  Performance could be improved")
        
        # Overall status
        self.log(f"\n🎯 OVERALL RESULT: {self.passed_tests}/{self.total_tests} tests passed ({round(self.passed_tests/self.total_tests*100, 1)}%)")
        
        if self.passed_tests == self.total_tests and not self.critical_errors:
            self.log("🎉 ALL TESTS PASSED - Backend is ready for production deployment!")
            self.log("   No 500 errors detected. System appears stable and healthy.")
        elif self.critical_errors:
            self.log("🚨 CRITICAL ISSUES DETECTED - Backend NOT ready for production!")
            self.log("   These issues may be causing the reported 500 errors.")
        else:
            self.log("⚠️  SOME TESTS FAILED - Review issues before deployment")
        
        self.log("=" * 80)
        
        return {
            "total_tests": self.total_tests,
            "passed_tests": self.passed_tests,
            "critical_errors": self.critical_errors,
            "avg_response_time": round(sum(response_times) / len(response_times), 2) if response_times else 0,
            "all_passed": self.passed_tests == self.total_tests and not self.critical_errors
        }

def main():
    """Main test runner"""
    tester = ComprehensiveBackendTester()
    summary = tester.run_comprehensive_tests()
    return summary

if __name__ == "__main__":
    main()