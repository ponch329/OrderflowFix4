#!/usr/bin/env python3
"""
Production Health Test for Bobblehead Proof Approval System

This test specifically addresses the review request to verify all critical functionality 
is working to resolve 500 errors on the live deployed application.

Tests the following critical endpoints:
1. Backend API Health Check - GET /api/health
2. Authentication Flow - POST /api/admin/login with admin/admin123
3. Order Loading Performance - GET /api/admin/orders with authentication
4. Critical Endpoints - GET /api/admin/orders/{order_id} with authentication

Usage: python production_health_test.py
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
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://orderflow-193.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials as specified in review request
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

class ProductionHealthTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.test_results = {
            "health_check": {"passed": False, "details": "", "response_time": 0},
            "authentication": {"passed": False, "details": "", "response_time": 0},
            "orders_loading": {"passed": False, "details": "", "response_time": 0},
            "order_details": {"passed": False, "details": "", "response_time": 0},
            "mongodb_connection": {"passed": False, "details": ""}
        }
        self.critical_errors = []
    
    def log(self, message):
        """Log test messages with timestamp"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def test_health_check(self):
        """Test GET /api/health endpoint"""
        self.log("🔍 Testing Backend API Health Check...")
        
        try:
            start_time = time.time()
            response = self.session.get(f"{API_BASE}/health", timeout=10)
            response_time = round((time.time() - start_time) * 1000, 2)
            
            self.test_results["health_check"]["response_time"] = response_time
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                if "status" in data and "database" in data and "timestamp" in data:
                    if data["status"] == "healthy" and data["database"] == "connected":
                        self.test_results["health_check"]["passed"] = True
                        self.test_results["health_check"]["details"] = f"✅ Health check passed. Status: {data['status']}, Database: {data['database']}, Response time: {response_time}ms"
                        self.test_results["mongodb_connection"]["passed"] = True
                        self.test_results["mongodb_connection"]["details"] = "✅ MongoDB connection verified via health check"
                        self.log(f"✅ Health check PASSED - Response time: {response_time}ms")
                    else:
                        self.test_results["health_check"]["details"] = f"❌ Health check shows degraded state. Status: {data.get('status')}, Database: {data.get('database')}"
                        self.critical_errors.append("Health check shows system is degraded")
                        self.log("❌ Health check shows degraded state")
                else:
                    self.test_results["health_check"]["details"] = f"❌ Health check response missing required fields: {data}"
                    self.critical_errors.append("Health check response malformed")
                    self.log("❌ Health check response missing required fields")
            else:
                self.test_results["health_check"]["details"] = f"❌ Health check failed with status {response.status_code}: {response.text}"
                self.critical_errors.append(f"Health check returned {response.status_code}")
                self.log(f"❌ Health check FAILED with status {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.test_results["health_check"]["details"] = "❌ Health check timed out after 10 seconds"
            self.critical_errors.append("Health check timeout")
            self.log("❌ Health check TIMED OUT")
        except Exception as e:
            self.test_results["health_check"]["details"] = f"❌ Health check exception: {str(e)}"
            self.critical_errors.append(f"Health check exception: {str(e)}")
            self.log(f"❌ Health check EXCEPTION: {e}")
    
    def test_authentication_flow(self):
        """Test POST /api/admin/login with credentials admin/admin123"""
        self.log("🔐 Testing Authentication Flow...")
        
        try:
            start_time = time.time()
            login_data = {
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{API_BASE}/admin/login", json=login_data, timeout=10)
            response_time = round((time.time() - start_time) * 1000, 2)
            
            self.test_results["authentication"]["response_time"] = response_time
            
            if response.status_code == 200:
                data = response.json()
                
                # Check for required fields
                if data.get("success") and "token" in data and "expires_at" in data:
                    self.admin_token = data["token"]
                    self.test_results["authentication"]["passed"] = True
                    self.test_results["authentication"]["details"] = f"✅ Authentication successful. JWT token received, expires at: {data['expires_at']}, Response time: {response_time}ms"
                    self.log(f"✅ Authentication PASSED - Response time: {response_time}ms")
                else:
                    self.test_results["authentication"]["details"] = f"❌ Authentication response missing required fields: {data}"
                    self.critical_errors.append("Authentication response malformed")
                    self.log("❌ Authentication response missing required fields")
            elif response.status_code == 401:
                self.test_results["authentication"]["details"] = f"❌ Authentication failed - Invalid credentials (401): {response.text}"
                self.critical_errors.append("Authentication failed - invalid credentials")
                self.log("❌ Authentication FAILED - Invalid credentials")
            elif response.status_code == 500:
                self.test_results["authentication"]["details"] = f"❌ Authentication failed with 500 error: {response.text}"
                self.critical_errors.append("Authentication endpoint returning 500 error")
                self.log("❌ Authentication FAILED with 500 error - CRITICAL ISSUE")
            else:
                self.test_results["authentication"]["details"] = f"❌ Authentication failed with status {response.status_code}: {response.text}"
                self.critical_errors.append(f"Authentication returned {response.status_code}")
                self.log(f"❌ Authentication FAILED with status {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.test_results["authentication"]["details"] = "❌ Authentication timed out after 10 seconds"
            self.critical_errors.append("Authentication timeout")
            self.log("❌ Authentication TIMED OUT")
        except Exception as e:
            self.test_results["authentication"]["details"] = f"❌ Authentication exception: {str(e)}"
            self.critical_errors.append(f"Authentication exception: {str(e)}")
            self.log(f"❌ Authentication EXCEPTION: {e}")
    
    def test_orders_loading_performance(self):
        """Test GET /api/admin/orders - verify it returns orders quickly"""
        self.log("📋 Testing Order Loading Performance...")
        
        if not self.admin_token:
            self.test_results["orders_loading"]["details"] = "❌ Cannot test - authentication failed"
            self.critical_errors.append("Cannot test orders loading - no auth token")
            self.log("❌ Cannot test orders loading - authentication failed")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            start_time = time.time()
            
            response = self.session.get(f"{API_BASE}/admin/orders", headers=headers, timeout=15)
            response_time = round((time.time() - start_time) * 1000, 2)
            
            self.test_results["orders_loading"]["response_time"] = response_time
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                if "orders" in data and "pagination" in data:
                    orders = data["orders"]
                    pagination = data["pagination"]
                    
                    # Verify pagination structure
                    required_pagination_fields = ["page", "limit", "total_count", "total_pages", "has_next", "has_prev"]
                    if all(field in pagination for field in required_pagination_fields):
                        self.test_results["orders_loading"]["passed"] = True
                        self.test_results["orders_loading"]["details"] = f"✅ Orders loading successful. Found {len(orders)} orders, Total: {pagination['total_count']}, Response time: {response_time}ms"
                        self.log(f"✅ Orders loading PASSED - {len(orders)} orders loaded in {response_time}ms")
                        
                        # Performance check - warn if slow
                        if response_time > 3000:  # 3 seconds
                            self.log(f"⚠️  WARNING: Orders loading is slow ({response_time}ms)")
                    else:
                        self.test_results["orders_loading"]["details"] = f"❌ Orders response missing pagination fields: {pagination}"
                        self.critical_errors.append("Orders response missing pagination structure")
                        self.log("❌ Orders response missing pagination fields")
                else:
                    self.test_results["orders_loading"]["details"] = f"❌ Orders response missing required structure: {list(data.keys())}"
                    self.critical_errors.append("Orders response malformed")
                    self.log("❌ Orders response missing required structure")
            elif response.status_code == 500:
                self.test_results["orders_loading"]["details"] = f"❌ Orders loading failed with 500 error: {response.text}"
                self.critical_errors.append("Orders endpoint returning 500 error - CRITICAL")
                self.log("❌ Orders loading FAILED with 500 error - CRITICAL ISSUE")
            else:
                self.test_results["orders_loading"]["details"] = f"❌ Orders loading failed with status {response.status_code}: {response.text}"
                self.critical_errors.append(f"Orders loading returned {response.status_code}")
                self.log(f"❌ Orders loading FAILED with status {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.test_results["orders_loading"]["details"] = "❌ Orders loading timed out after 15 seconds"
            self.critical_errors.append("Orders loading timeout")
            self.log("❌ Orders loading TIMED OUT")
        except Exception as e:
            self.test_results["orders_loading"]["details"] = f"❌ Orders loading exception: {str(e)}"
            self.critical_errors.append(f"Orders loading exception: {str(e)}")
            self.log(f"❌ Orders loading EXCEPTION: {e}")
    
    def test_order_details(self):
        """Test GET /api/admin/orders/{order_id} with auth token"""
        self.log("📄 Testing Order Details Endpoint...")
        
        if not self.admin_token:
            self.test_results["order_details"]["details"] = "❌ Cannot test - authentication failed"
            self.critical_errors.append("Cannot test order details - no auth token")
            self.log("❌ Cannot test order details - authentication failed")
            return
        
        # First, get an order ID from the orders list
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            orders_response = self.session.get(f"{API_BASE}/admin/orders", headers=headers, timeout=10)
            
            if orders_response.status_code != 200:
                self.test_results["order_details"]["details"] = "❌ Cannot get order ID - orders endpoint failed"
                self.critical_errors.append("Cannot get order ID for details test")
                self.log("❌ Cannot get order ID - orders endpoint failed")
                return
            
            orders_data = orders_response.json()
            if not orders_data.get("orders") or len(orders_data["orders"]) == 0:
                self.test_results["order_details"]["details"] = "❌ No orders available to test order details"
                self.log("❌ No orders available to test order details")
                return
            
            # Use the first order
            test_order_id = orders_data["orders"][0]["id"]
            self.log(f"Using order ID: {test_order_id}")
            
            # Test order details endpoint
            start_time = time.time()
            response = self.session.get(f"{API_BASE}/admin/orders/{test_order_id}", headers=headers, timeout=10)
            response_time = round((time.time() - start_time) * 1000, 2)
            
            self.test_results["order_details"]["response_time"] = response_time
            
            if response.status_code == 200:
                data = response.json()
                
                # Check for essential order fields
                required_fields = ["id", "order_number", "customer_email", "stage", "created_at"]
                if all(field in data for field in required_fields):
                    self.test_results["order_details"]["passed"] = True
                    self.test_results["order_details"]["details"] = f"✅ Order details successful. Order: {data.get('order_number')}, Stage: {data.get('stage')}, Response time: {response_time}ms"
                    self.log(f"✅ Order details PASSED - Response time: {response_time}ms")
                else:
                    missing_fields = [field for field in required_fields if field not in data]
                    self.test_results["order_details"]["details"] = f"❌ Order details missing required fields: {missing_fields}"
                    self.critical_errors.append(f"Order details missing fields: {missing_fields}")
                    self.log(f"❌ Order details missing required fields: {missing_fields}")
            elif response.status_code == 404:
                self.test_results["order_details"]["details"] = f"❌ Order not found (404) - Order ID: {test_order_id}"
                self.critical_errors.append("Order details returned 404 for existing order")
                self.log("❌ Order details returned 404 for existing order")
            elif response.status_code == 500:
                self.test_results["order_details"]["details"] = f"❌ Order details failed with 500 error: {response.text}"
                self.critical_errors.append("Order details endpoint returning 500 error - CRITICAL")
                self.log("❌ Order details FAILED with 500 error - CRITICAL ISSUE")
            else:
                self.test_results["order_details"]["details"] = f"❌ Order details failed with status {response.status_code}: {response.text}"
                self.critical_errors.append(f"Order details returned {response.status_code}")
                self.log(f"❌ Order details FAILED with status {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.test_results["order_details"]["details"] = "❌ Order details timed out after 10 seconds"
            self.critical_errors.append("Order details timeout")
            self.log("❌ Order details TIMED OUT")
        except Exception as e:
            self.test_results["order_details"]["details"] = f"❌ Order details exception: {str(e)}"
            self.critical_errors.append(f"Order details exception: {str(e)}")
            self.log(f"❌ Order details EXCEPTION: {e}")
    
    def run_all_tests(self):
        """Run all production health tests"""
        self.log("=" * 80)
        self.log("🏥 PRODUCTION HEALTH TEST - BOBBLEHEAD PROOF APPROVAL SYSTEM")
        self.log("=" * 80)
        self.log(f"Testing against: {API_BASE}")
        self.log(f"Admin credentials: {ADMIN_USERNAME}/{ADMIN_PASSWORD}")
        self.log("")
        
        # Run tests in sequence
        self.test_health_check()
        self.log("")
        
        self.test_authentication_flow()
        self.log("")
        
        self.test_orders_loading_performance()
        self.log("")
        
        self.test_order_details()
        self.log("")
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print comprehensive test results summary"""
        self.log("=" * 80)
        self.log("📊 PRODUCTION HEALTH TEST RESULTS")
        self.log("=" * 80)
        
        total_tests = len([t for t in self.test_results.values() if "response_time" in t])
        passed_tests = sum(1 for result in self.test_results.values() if result["passed"])
        
        # Print individual test results
        for test_name, result in self.test_results.items():
            if test_name == "mongodb_connection":
                continue  # Skip MongoDB as it's covered in health check
                
            status = "✅ PASSED" if result["passed"] else "❌ FAILED"
            response_time = f" ({result['response_time']}ms)" if result.get("response_time") else ""
            
            self.log(f"{test_name.upper().replace('_', ' ')}: {status}{response_time}")
            self.log(f"  {result['details']}")
            self.log("")
        
        # MongoDB connection status
        mongo_status = "✅ CONNECTED" if self.test_results["mongodb_connection"]["passed"] else "❌ DISCONNECTED"
        self.log(f"MONGODB CONNECTION: {mongo_status}")
        self.log(f"  {self.test_results['mongodb_connection']['details']}")
        self.log("")
        
        # Critical errors summary
        if self.critical_errors:
            self.log("🚨 CRITICAL ERRORS FOUND:")
            for i, error in enumerate(self.critical_errors, 1):
                self.log(f"  {i}. {error}")
            self.log("")
        
        # Overall status
        self.log(f"OVERALL RESULT: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests and not self.critical_errors:
            self.log("🎉 ALL TESTS PASSED - System appears healthy for production deployment!")
        elif self.critical_errors:
            self.log("🚨 CRITICAL ISSUES FOUND - System NOT ready for production deployment!")
            self.log("   These issues may be causing the 500 errors in production.")
        else:
            self.log("⚠️  SOME TESTS FAILED - Review issues before production deployment")
        
        self.log("=" * 80)
        
        # Return summary for test_result.md update
        return {
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "critical_errors": self.critical_errors,
            "all_passed": passed_tests == total_tests and not self.critical_errors
        }

def main():
    """Main test runner"""
    tester = ProductionHealthTester()
    summary = tester.run_all_tests()
    return summary

if __name__ == "__main__":
    main()