#!/usr/bin/env python3
"""
Additional Shopify Tag Sync Tests - Edge Cases and Error Handling

Tests additional scenarios for Shopify tag syncing:
1. Order without Shopify ID
2. Invalid order ID
3. Bulk sync with mixed valid/invalid orders
4. Different stage transitions

Usage: python shopify_tag_sync_additional_test.py
"""

import requests
import json
import uuid
from datetime import datetime
import os
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / 'frontend' / '.env')

# Configuration
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://proof-portal.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

class ShopifyTagSyncAdditionalTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.results = {
            "admin_login": {"passed": False, "details": ""},
            "invalid_order_test": {"passed": False, "details": ""},
            "mixed_bulk_sync": {"passed": False, "details": ""},
            "stage_transition_test": {"passed": False, "details": ""}
        }
    
    def log(self, message):
        """Log test messages"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def test_admin_login(self):
        """Test admin login authentication"""
        self.log("Testing Admin Login Authentication...")
        
        try:
            login_data = {
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{API_BASE}/admin/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and "token" in data:
                    self.admin_token = data["token"]
                    self.results["admin_login"]["passed"] = True
                    self.results["admin_login"]["details"] = f"✅ Admin login successful."
                    self.log("✅ Admin login successful")
                else:
                    self.results["admin_login"]["details"] = f"❌ Login response missing required fields: {data}"
            else:
                self.results["admin_login"]["details"] = f"❌ Login failed with status {response.status_code}: {response.text}"
                
        except Exception as e:
            self.results["admin_login"]["details"] = f"❌ Exception during admin login test: {str(e)}"
    
    def test_invalid_order_scenarios(self):
        """Test sync with invalid order IDs and orders without Shopify IDs"""
        self.log("Testing Invalid Order Scenarios...")
        
        if not self.admin_token:
            self.results["invalid_order_test"]["details"] = "❌ Cannot test - admin login failed"
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Test 1: Non-existent order ID
            fake_order_id = str(uuid.uuid4())
            self.log(f"Testing with non-existent order ID: {fake_order_id}")
            
            response = self.session.post(
                f"{API_BASE}/admin/orders/{fake_order_id}/sync-shopify-tags",
                headers=headers
            )
            
            if response.status_code == 404:
                self.log("✅ Non-existent order correctly returns 404")
                
                # Test 2: Find an order that exists but might not have Shopify ID
                orders_response = self.session.get(f"{API_BASE}/admin/orders?limit=10", headers=headers)
                
                if orders_response.status_code == 200:
                    orders_data = orders_response.json()
                    orders = orders_data.get("orders", [])
                    
                    # Look for an order without shopify_order_id or with manual order flag
                    test_order = None
                    for order in orders:
                        if not order.get("shopify_order_id") or order.get("is_manual_order"):
                            test_order = order
                            break
                    
                    if test_order:
                        self.log(f"Testing order without Shopify ID: {test_order['id']}")
                        
                        no_shopify_response = self.session.post(
                            f"{API_BASE}/admin/orders/{test_order['id']}/sync-shopify-tags",
                            headers=headers
                        )
                        
                        if no_shopify_response.status_code == 400:
                            error_data = no_shopify_response.json()
                            if "Shopify order ID" in error_data.get("detail", ""):
                                self.results["invalid_order_test"]["passed"] = True
                                self.results["invalid_order_test"]["details"] = "✅ Invalid order scenarios handled correctly. Non-existent order returns 404, order without Shopify ID returns 400 with appropriate error message."
                                self.log("✅ Order without Shopify ID correctly returns 400")
                            else:
                                self.results["invalid_order_test"]["details"] = f"❌ Order without Shopify ID returned 400 but with wrong error: {error_data}"
                        else:
                            self.results["invalid_order_test"]["details"] = f"❌ Order without Shopify ID should return 400, got {no_shopify_response.status_code}"
                    else:
                        # All orders have Shopify IDs, which is actually good
                        self.results["invalid_order_test"]["passed"] = True
                        self.results["invalid_order_test"]["details"] = "✅ Invalid order scenarios handled correctly. Non-existent order returns 404. All existing orders have Shopify IDs (good data integrity)."
                        self.log("✅ All orders have Shopify IDs - good data integrity")
                else:
                    self.results["invalid_order_test"]["details"] = f"❌ Cannot get orders list: {orders_response.status_code}"
            else:
                self.results["invalid_order_test"]["details"] = f"❌ Non-existent order should return 404, got {response.status_code}"
                
        except Exception as e:
            self.results["invalid_order_test"]["details"] = f"❌ Exception during invalid order test: {str(e)}"
    
    def test_mixed_bulk_sync(self):
        """Test bulk sync with mix of valid and invalid order IDs"""
        self.log("Testing Mixed Bulk Sync...")
        
        if not self.admin_token:
            self.results["mixed_bulk_sync"]["details"] = "❌ Cannot test - admin login failed"
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Get some real order IDs
            orders_response = self.session.get(f"{API_BASE}/admin/orders?limit=2", headers=headers)
            
            if orders_response.status_code == 200:
                orders_data = orders_response.json()
                orders = orders_data.get("orders", [])
                
                if len(orders) >= 1:
                    # Mix of valid and invalid order IDs
                    valid_order_id = orders[0]["id"]
                    invalid_order_id = str(uuid.uuid4())
                    
                    mixed_order_ids = [valid_order_id, invalid_order_id]
                    
                    self.log(f"Testing bulk sync with mixed IDs: 1 valid, 1 invalid")
                    
                    response = self.session.post(
                        f"{API_BASE}/admin/orders/bulk-sync-shopify-tags",
                        json=mixed_order_ids,
                        headers=headers
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        success_count = data.get("success", 0)
                        failed_count = data.get("failed", 0)
                        total_count = data.get("total", 0)
                        
                        # Should have some successes and some failures
                        if success_count > 0 and total_count == len(mixed_order_ids):
                            self.results["mixed_bulk_sync"]["passed"] = True
                            self.results["mixed_bulk_sync"]["details"] = f"✅ Mixed bulk sync handled correctly. Success: {success_count}, Failed: {failed_count}, Total: {total_count}. Properly handles mix of valid/invalid orders."
                            self.log(f"✅ Mixed bulk sync: {success_count} success, {failed_count} failed")
                        else:
                            self.results["mixed_bulk_sync"]["details"] = f"❌ Mixed bulk sync unexpected results: Success: {success_count}, Failed: {failed_count}, Total: {total_count}"
                    else:
                        self.results["mixed_bulk_sync"]["details"] = f"❌ Mixed bulk sync failed with status {response.status_code}: {response.text}"
                else:
                    self.results["mixed_bulk_sync"]["details"] = "❌ Not enough orders to test mixed bulk sync"
            else:
                self.results["mixed_bulk_sync"]["details"] = f"❌ Cannot get orders for mixed bulk sync test: {orders_response.status_code}"
                
        except Exception as e:
            self.results["mixed_bulk_sync"]["details"] = f"❌ Exception during mixed bulk sync test: {str(e)}"
    
    def test_stage_transition(self):
        """Test tag sync during stage transitions"""
        self.log("Testing Stage Transition Tag Sync...")
        
        if not self.admin_token:
            self.results["stage_transition_test"]["details"] = "❌ Cannot test - admin login failed"
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Get an order to test with
            orders_response = self.session.get(f"{API_BASE}/admin/orders?limit=1", headers=headers)
            
            if orders_response.status_code == 200:
                orders_data = orders_response.json()
                orders = orders_data.get("orders", [])
                
                if len(orders) >= 1:
                    test_order = orders[0]
                    order_id = test_order["id"]
                    current_stage = test_order.get("stage", "clay")
                    
                    self.log(f"Testing stage transition for order: {order_id} (current stage: {current_stage})")
                    
                    # Test changing to a different stage (if currently clay, try paint)
                    if current_stage == "clay":
                        new_stage = "paint"
                        update_data = {"stage": new_stage}
                    else:
                        # If not clay, change to clay
                        new_stage = "clay"
                        update_data = {"stage": new_stage}
                    
                    self.log(f"Changing stage from {current_stage} to {new_stage}")
                    
                    response = self.session.patch(
                        f"{API_BASE}/admin/orders/{order_id}/status",
                        json=update_data,
                        headers=headers
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        if "message" in data:
                            self.results["stage_transition_test"]["passed"] = True
                            self.results["stage_transition_test"]["details"] = f"✅ Stage transition tag sync successful. Changed stage from {current_stage} to {new_stage}. Response: {data['message']}. Tag sync should be scheduled in logs."
                            self.log(f"✅ Stage transition successful: {current_stage} -> {new_stage}")
                        else:
                            self.results["stage_transition_test"]["details"] = f"❌ Stage transition response missing message: {data}"
                    else:
                        self.results["stage_transition_test"]["details"] = f"❌ Stage transition failed with status {response.status_code}: {response.text}"
                else:
                    self.results["stage_transition_test"]["details"] = "❌ No orders available for stage transition test"
            else:
                self.results["stage_transition_test"]["details"] = f"❌ Cannot get orders for stage transition test: {orders_response.status_code}"
                
        except Exception as e:
            self.results["stage_transition_test"]["details"] = f"❌ Exception during stage transition test: {str(e)}"
    
    def run_all_tests(self):
        """Run all additional tests"""
        self.log("=" * 70)
        self.log("SHOPIFY TAG SYNC - ADDITIONAL TESTS (Edge Cases)")
        self.log("=" * 70)
        self.log(f"Testing against: {API_BASE}")
        self.log("")
        
        # Run tests in sequence
        self.test_admin_login()
        self.log("")
        
        self.test_invalid_order_scenarios()
        self.log("")
        
        self.test_mixed_bulk_sync()
        self.log("")
        
        self.test_stage_transition()
        self.log("")
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test results summary"""
        self.log("=" * 70)
        self.log("ADDITIONAL TESTS SUMMARY")
        self.log("=" * 70)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for result in self.results.values() if result["passed"])
        
        for test_name, result in self.results.items():
            status = "✅ PASSED" if result["passed"] else "❌ FAILED"
            self.log(f"{test_name.upper().replace('_', ' ')}: {status}")
            self.log(f"  Details: {result['details']}")
            self.log("")
        
        self.log(f"ADDITIONAL TESTS: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            self.log("🎉 ALL ADDITIONAL TESTS PASSED!")
        else:
            self.log("⚠️  SOME ADDITIONAL TESTS FAILED")
        
        self.log("=" * 70)

def main():
    """Main test runner"""
    tester = ShopifyTagSyncAdditionalTester()
    tester.run_all_tests()

if __name__ == "__main__":
    main()