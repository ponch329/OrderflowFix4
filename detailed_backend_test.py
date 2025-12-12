#!/usr/bin/env python3
"""
Detailed Backend API Testing for Bobblehead Proof Approval System

Comprehensive testing of all requested features with detailed verification.
"""

import requests
import json
import uuid
import base64
from datetime import datetime
import os
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / 'frontend' / '.env')

# Configuration
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://order-track-pro-1.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

class DetailedAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        
    def log(self, message):
        """Log test messages"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def test_admin_login_comprehensive(self):
        """Comprehensive admin login testing"""
        self.log("🔐 COMPREHENSIVE ADMIN LOGIN TESTING")
        self.log("-" * 50)
        
        # Test 1: Valid credentials
        self.log("Test 1: Valid admin credentials")
        login_data = {"username": "admin", "password": "admin123"}
        response = self.session.post(f"{API_BASE}/admin/login", json=login_data)
        
        if response.status_code == 200:
            data = response.json()
            self.log(f"✅ Status: {response.status_code}")
            self.log(f"✅ Response keys: {list(data.keys())}")
            self.log(f"✅ Success field: {data.get('success')}")
            self.log(f"✅ Token present: {'token' in data}")
            self.log(f"✅ Expires_at present: {'expires_at' in data}")
            
            if data.get('success') and 'token' in data:
                self.admin_token = data['token']
                self.log("✅ Admin token stored for subsequent tests")
            else:
                self.log("❌ Login response missing required fields")
        else:
            self.log(f"❌ Login failed with status: {response.status_code}")
            self.log(f"❌ Response: {response.text}")
        
        # Test 2: Invalid username
        self.log("\nTest 2: Invalid username")
        invalid_user = {"username": "wronguser", "password": "admin123"}
        response = self.session.post(f"{API_BASE}/admin/login", json=invalid_user)
        
        if response.status_code == 401:
            self.log("✅ Invalid username correctly rejected with 401")
        else:
            self.log(f"❌ Expected 401, got {response.status_code}")
        
        # Test 3: Invalid password
        self.log("\nTest 3: Invalid password")
        invalid_pass = {"username": "admin", "password": "wrongpass"}
        response = self.session.post(f"{API_BASE}/admin/login", json=invalid_pass)
        
        if response.status_code == 401:
            self.log("✅ Invalid password correctly rejected with 401")
        else:
            self.log(f"❌ Expected 401, got {response.status_code}")
        
        # Test 4: Missing fields
        self.log("\nTest 4: Missing username field")
        missing_user = {"password": "admin123"}
        response = self.session.post(f"{API_BASE}/admin/login", json=missing_user)
        self.log(f"Missing username response: {response.status_code}")
        
        self.log("\nTest 5: Missing password field")
        missing_pass = {"username": "admin"}
        response = self.session.post(f"{API_BASE}/admin/login", json=missing_pass)
        self.log(f"Missing password response: {response.status_code}")
        
        return self.admin_token is not None
    
    def test_email_notifications_detailed(self):
        """Detailed email notification testing"""
        self.log("\n📧 DETAILED EMAIL NOTIFICATION TESTING")
        self.log("-" * 50)
        
        if not self.admin_token:
            self.log("❌ Cannot test - admin login failed")
            return False
        
        # Get existing orders
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        response = self.session.get(f"{API_BASE}/admin/orders", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to get orders: {response.status_code}")
            return False
        
        orders = response.json()
        if not orders:
            self.log("❌ No orders available for testing")
            return False
        
        test_order = orders[0]
        order_id = test_order["id"]
        self.log(f"Using order: {order_id} (#{test_order.get('order_number', 'N/A')})")
        
        # Create test image
        import io
        from PIL import Image
        img = Image.new('RGB', (100, 100), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        image_data = img_bytes.getvalue()
        
        # Test proof upload with email notification
        self.log("\nTest 1: Upload proofs and trigger email notification")
        files = {'files': ('test_notification.png', image_data, 'image/png')}
        data = {'stage': 'clay'}
        
        response = self.session.post(
            f"{API_BASE}/admin/orders/{order_id}/proofs",
            files=files,
            data=data,
            headers=headers
        )
        
        if response.status_code == 200:
            result = response.json()
            self.log(f"✅ Proof upload successful: {response.status_code}")
            self.log(f"✅ Proofs uploaded: {len(result.get('proofs', []))}")
            self.log(f"✅ Response message: {result.get('message', 'N/A')}")
            
            # Check if order status was updated to feedback_needed
            order_response = self.session.get(f"{API_BASE}/admin/orders", headers=headers)
            if order_response.status_code == 200:
                updated_orders = order_response.json()
                updated_order = next((o for o in updated_orders if o["id"] == order_id), None)
                if updated_order:
                    clay_status = updated_order.get("clay_status")
                    self.log(f"✅ Order clay_status updated to: {clay_status}")
                    if clay_status == "feedback_needed":
                        self.log("✅ Order status correctly updated to 'feedback_needed'")
                        return True
                    else:
                        self.log(f"❌ Expected clay_status 'feedback_needed', got '{clay_status}'")
                else:
                    self.log("❌ Could not find updated order")
            else:
                self.log("❌ Failed to verify order status update")
        else:
            self.log(f"❌ Proof upload failed: {response.status_code}")
            self.log(f"❌ Response: {response.text}")
        
        return False
    
    def test_proof_deletion_detailed(self):
        """Detailed proof deletion testing"""
        self.log("\n🗑️  DETAILED PROOF DELETION TESTING")
        self.log("-" * 50)
        
        if not self.admin_token:
            self.log("❌ Cannot test - admin login failed")
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Get orders with proofs
        response = self.session.get(f"{API_BASE}/admin/orders", headers=headers)
        if response.status_code != 200:
            self.log(f"❌ Failed to get orders: {response.status_code}")
            return False
        
        orders = response.json()
        test_order = None
        test_proof_id = None
        
        # Find an order with clay proofs
        for order in orders:
            clay_proofs = order.get("clay_proofs", [])
            if clay_proofs:
                test_order = order
                test_proof_id = clay_proofs[0]["id"]
                break
        
        if not test_order or not test_proof_id:
            self.log("❌ No orders with clay proofs found for deletion testing")
            return False
        
        order_id = test_order["id"]
        initial_proof_count = len(test_order.get("clay_proofs", []))
        
        self.log(f"Using order: {order_id}")
        self.log(f"Initial proof count: {initial_proof_count}")
        self.log(f"Deleting proof: {test_proof_id}")
        
        # Test 1: Valid proof deletion
        self.log("\nTest 1: Delete existing proof")
        response = self.session.delete(
            f"{API_BASE}/admin/orders/{order_id}/proofs/{test_proof_id}?stage=clay",
            headers=headers
        )
        
        if response.status_code == 200:
            result = response.json()
            remaining_count = result.get("remaining_proofs", -1)
            self.log(f"✅ Deletion successful: {response.status_code}")
            self.log(f"✅ Remaining proofs: {remaining_count}")
            self.log(f"✅ Message: {result.get('message', 'N/A')}")
            
            if remaining_count == initial_proof_count - 1:
                self.log("✅ Proof count correctly decremented")
            else:
                self.log(f"❌ Expected {initial_proof_count - 1} remaining, got {remaining_count}")
        else:
            self.log(f"❌ Deletion failed: {response.status_code}")
            self.log(f"❌ Response: {response.text}")
        
        # Test 2: Invalid proof ID
        self.log("\nTest 2: Delete non-existent proof")
        fake_proof_id = str(uuid.uuid4())
        response = self.session.delete(
            f"{API_BASE}/admin/orders/{order_id}/proofs/{fake_proof_id}?stage=clay",
            headers=headers
        )
        
        if response.status_code == 404:
            self.log("✅ Non-existent proof correctly returns 404")
        else:
            self.log(f"❌ Expected 404 for non-existent proof, got {response.status_code}")
        
        # Test 3: Invalid stage parameter
        self.log("\nTest 3: Invalid stage parameter")
        response = self.session.delete(
            f"{API_BASE}/admin/orders/{order_id}/proofs/{test_proof_id}?stage=invalid",
            headers=headers
        )
        
        if response.status_code == 400:
            self.log("✅ Invalid stage correctly returns 400")
        else:
            self.log(f"Invalid stage response: {response.status_code}")
        
        return True
    
    def run_comprehensive_tests(self):
        """Run all comprehensive tests"""
        self.log("=" * 70)
        self.log("COMPREHENSIVE BOBBLEHEAD PROOF APPROVAL SYSTEM TESTS")
        self.log("=" * 70)
        self.log(f"Testing against: {API_BASE}")
        self.log("")
        
        # Run tests
        login_success = self.test_admin_login_comprehensive()
        email_success = self.test_email_notifications_detailed()
        deletion_success = self.test_proof_deletion_detailed()
        
        # Summary
        self.log("\n" + "=" * 70)
        self.log("COMPREHENSIVE TEST SUMMARY")
        self.log("=" * 70)
        
        tests = [
            ("Admin Login Authentication", login_success),
            ("Email Notifications", email_success),
            ("Proof Deletion", deletion_success)
        ]
        
        passed = sum(1 for _, success in tests if success)
        total = len(tests)
        
        for test_name, success in tests:
            status = "✅ PASSED" if success else "❌ FAILED"
            self.log(f"{test_name}: {status}")
        
        self.log(f"\nOVERALL: {passed}/{total} test categories passed")
        
        if passed == total:
            self.log("🎉 ALL COMPREHENSIVE TESTS PASSED!")
        else:
            self.log("⚠️  SOME TESTS FAILED")
        
        self.log("=" * 70)

def main():
    tester = DetailedAPITester()
    tester.run_comprehensive_tests()

if __name__ == "__main__":
    main()