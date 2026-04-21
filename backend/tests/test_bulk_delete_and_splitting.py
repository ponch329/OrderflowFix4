"""
Tests for bulk-delete endpoints, cascade delete, splitting logic, and total_quantity.
Covers:
  - POST /api/admin/orders/bulk-delete
  - POST /api/admin/orders/bulk-delete-by-filter
  - DELETE /api/admin/orders/{order_id}
  - order_splitting module (should_split_order, split_order_by_bobblehead_count)
  - total_quantity field on order list
"""
import os
import sys
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

TEST_PREFIX = "TEST_BDT_"  # so we can clean up only our data


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # login for token (endpoints appear open but we still attach Authorization)
    try:
        r = s.post(f"{API}/admin/login", json={"username": "admin", "password": "admin123"}, timeout=15)
        if r.status_code == 200:
            token = r.json().get("token") or r.json().get("access_token")
            if token:
                s.headers.update({"Authorization": f"Bearer {token}"})
    except Exception:
        pass
    return s


@pytest.fixture(scope="session")
def tenant_id():
    # Pull tenant_id from mongo directly (matches server logic: first tenant)
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    assert mongo_url and db_name
    client = MongoClient(mongo_url)
    t = client[db_name].tenants.find_one({}, {"_id": 0})
    client.close()
    assert t is not None, "No tenant in DB"
    return t["id"]


def _insert_order(tenant_id, order_number, parent_order_id=None, total_quantity=1, line_items=None):
    """Insert a raw test order directly into mongo so we can test cascade/bulk without side effects."""
    from pymongo import MongoClient
    from datetime import datetime, timezone
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    oid = str(uuid.uuid4())
    doc = {
        "id": oid,
        "tenant_id": tenant_id,
        "order_number": order_number,
        "parent_order_id": parent_order_id,
        "customer_email": "test@example.com",
        "customer_name": "Test Customer",
        "item_vendor": "TestVendor",
        "line_items": line_items or [{"sku": "TESTSKU", "quantity": total_quantity, "title": "TestItem"}],
        "total_quantity": total_quantity,
        "stage": "clay",
        "clay_status": "sculpting",
        "paint_status": "pending",
        "is_manual_order": True,
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    client[db_name].orders.insert_one(doc)
    client.close()
    return oid


def _order_exists(order_id, tenant_id):
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    n = client[db_name].orders.count_documents({"id": order_id, "tenant_id": tenant_id})
    client.close()
    return n > 0


def _cleanup_test_orders(tenant_id):
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    client[db_name].orders.delete_many({"tenant_id": tenant_id, "order_number": {"$regex": f"^{TEST_PREFIX}"}})
    client.close()


@pytest.fixture(autouse=True, scope="session")
def _final_cleanup(tenant_id):
    yield
    _cleanup_test_orders(tenant_id)


# ---------- Basic connectivity ----------
class TestHealth:
    def test_admin_login(self, api_client):
        r = api_client.post(f"{API}/admin/login", json={"username": "admin", "password": "admin123"}, timeout=15)
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"

    def test_orders_list_returns_total_quantity(self, api_client, tenant_id):
        # Seed a test order with quantity=5
        oid = _insert_order(tenant_id, f"{TEST_PREFIX}{uuid.uuid4().hex[:6]}", total_quantity=5)
        try:
            r = api_client.get(f"{API}/admin/orders?page=1&limit=200", timeout=20)
            assert r.status_code == 200, r.text
            data = r.json()
            orders = data.get("orders", [])
            ours = [o for o in orders if o.get("id") == oid]
            assert ours, "Test order not in listing"
            assert "total_quantity" in ours[0], f"total_quantity missing. Keys: {list(ours[0].keys())}"
            assert ours[0]["total_quantity"] == 5
        finally:
            api_client.delete(f"{API}/admin/orders/{oid}")


# ---------- Validation: POST /admin/orders/bulk-delete ----------
class TestBulkDeleteValidation:
    def test_bulk_delete_missing_confirm_returns_400(self, api_client):
        r = api_client.post(f"{API}/admin/orders/bulk-delete", json={"order_ids": ["fake-id"]}, timeout=15)
        assert r.status_code == 400
        assert "confirm" in r.text.lower()

    def test_bulk_delete_empty_ids_returns_400(self, api_client):
        r = api_client.post(f"{API}/admin/orders/bulk-delete", json={"order_ids": [], "confirm": True}, timeout=15)
        assert r.status_code == 400

    def test_bulk_delete_nonexistent_ids_returns_200(self, api_client):
        fake = [str(uuid.uuid4()), str(uuid.uuid4())]
        r = api_client.post(f"{API}/admin/orders/bulk-delete", json={"order_ids": fake, "confirm": True}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted_count") == 0
        assert body.get("requested_count") == 2


# ---------- Cascade delete ----------
class TestCascadeDelete:
    def test_bulk_delete_cascades_to_sub_orders(self, api_client, tenant_id):
        parent_id = _insert_order(tenant_id, f"{TEST_PREFIX}P{uuid.uuid4().hex[:6]}", total_quantity=1)
        sub1 = _insert_order(tenant_id, f"{TEST_PREFIX}S1_{uuid.uuid4().hex[:6]}", parent_order_id=parent_id)
        sub2 = _insert_order(tenant_id, f"{TEST_PREFIX}S2_{uuid.uuid4().hex[:6]}", parent_order_id=parent_id)

        r = api_client.post(
            f"{API}/admin/orders/bulk-delete",
            json={"order_ids": [parent_id], "confirm": True},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted_count") == 3, f"Expected cascade delete of 3, got {body}"
        assert not _order_exists(parent_id, tenant_id)
        assert not _order_exists(sub1, tenant_id)
        assert not _order_exists(sub2, tenant_id)

    def test_single_delete_returns_404_for_missing(self, api_client):
        r = api_client.delete(f"{API}/admin/orders/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 404

    def test_single_delete_cascades(self, api_client, tenant_id):
        parent_id = _insert_order(tenant_id, f"{TEST_PREFIX}SDP{uuid.uuid4().hex[:6]}")
        sub_id = _insert_order(tenant_id, f"{TEST_PREFIX}SDS{uuid.uuid4().hex[:6]}", parent_order_id=parent_id)

        r = api_client.delete(f"{API}/admin/orders/{parent_id}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted_count") == 2
        assert not _order_exists(parent_id, tenant_id)
        assert not _order_exists(sub_id, tenant_id)


# ---------- bulk-delete-by-filter ----------
class TestBulkDeleteByFilter:
    def test_missing_confirm_returns_400(self, api_client):
        r = api_client.post(f"{API}/admin/orders/bulk-delete-by-filter", json={"search": "_nonexistent_"}, timeout=15)
        assert r.status_code == 400

    def test_filter_with_no_match_returns_0(self, api_client):
        r = api_client.post(
            f"{API}/admin/orders/bulk-delete-by-filter",
            json={"search": f"NOMATCH_{uuid.uuid4().hex}", "confirm": True},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("matched_count") == 0
        assert body.get("deleted_count") == 0

    def test_filter_delete_cascades_and_count_matches(self, api_client, tenant_id):
        tag = f"{TEST_PREFIX}FLT{uuid.uuid4().hex[:8]}"
        # Create 2 parents matching search=tag, each with 1 sub-order
        parents = []
        subs = []
        for i in range(2):
            p = _insert_order(tenant_id, f"{tag}_P{i}")
            parents.append(p)
            s = _insert_order(tenant_id, f"{tag}_S{i}", parent_order_id=p)
            subs.append(s)

        # Expected_count mismatch => 409
        r_mis = api_client.post(
            f"{API}/admin/orders/bulk-delete-by-filter",
            json={"search": tag, "confirm": True, "expected_count": 99},
            timeout=20,
        )
        assert r_mis.status_code == 409, f"Expected 409 on count mismatch, got {r_mis.status_code}: {r_mis.text}"

        # Search should match 4 (2 parents + 2 subs because sub names include tag)
        r_ok = api_client.post(
            f"{API}/admin/orders/bulk-delete-by-filter",
            json={"search": tag, "confirm": True, "expected_count": 4},
            timeout=20,
        )
        assert r_ok.status_code == 200, r_ok.text
        body = r_ok.json()
        assert body.get("matched_count") == 4
        # Cascade dedupes - 4 matched, parents cascade to subs (already in set)
        assert body.get("deleted_count") == 4
        for oid in parents + subs:
            assert not _order_exists(oid, tenant_id)


# ---------- Splitting logic unit tests ----------
class TestSplittingLogic:
    def test_should_not_split_identical_skus(self):
        from utils.order_splitting import should_split_order
        items = [{"sku": "A1", "quantity": 50}, {"sku": "A1", "quantity": 80}]
        assert asyncio.run(should_split_order(items)) is False

    def test_should_split_different_skus(self):
        from utils.order_splitting import should_split_order
        items = [{"sku": "A1", "quantity": 1}, {"sku": "A2", "quantity": 1}]
        assert asyncio.run(should_split_order(items)) is True

    def test_should_not_split_empty(self):
        from utils.order_splitting import should_split_order
        assert asyncio.run(should_split_order([])) is False

    def test_should_not_split_no_sku_same_title(self):
        from utils.order_splitting import should_split_order
        items = [{"title": "Same", "vendor": "V", "quantity": 1}, {"title": "Same", "vendor": "V", "quantity": 2}]
        assert asyncio.run(should_split_order(items)) is False

    def test_split_130_identical_creates_zero_sub_orders(self, tenant_id):
        from utils.order_splitting import split_order_by_bobblehead_count
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")

        async def run():
            client = AsyncIOMotorClient(mongo_url)
            dbh = client[db_name]
            order_data = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "order_number": f"{TEST_PREFIX}SL1"}
            items = [{"sku": "BOBBLE1", "quantity": 130, "title": "Same"}]
            result = await split_order_by_bobblehead_count(dbh, order_data, items)
            client.close()
            return result

        res = asyncio.run(run())
        assert res == [], f"Expected no sub-orders for 130 identical SKUs, got {res}"

    def test_split_two_unique_skus_creates_two_sub_orders(self, tenant_id):
        from utils.order_splitting import split_order_by_bobblehead_count
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")

        parent_num = f"{TEST_PREFIX}SL2_{uuid.uuid4().hex[:6]}"

        async def run():
            client = AsyncIOMotorClient(mongo_url)
            dbh = client[db_name]
            order_data = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "order_number": parent_num,
                "customer_email": "c@x.com",
                "customer_name": "C",
            }
            items = [{"sku": "A", "quantity": 3, "title": "A"}, {"sku": "B", "quantity": 5, "title": "B"}]
            result = await split_order_by_bobblehead_count(dbh, order_data, items)
            client.close()
            return result

        ids = asyncio.run(run())
        assert len(ids) == 2, f"Expected 2 sub-orders for 2 unique SKUs, got {len(ids)}"

        # Cleanup created sub-orders
        from pymongo import MongoClient
        client = MongoClient(mongo_url)
        client[db_name].orders.delete_many({"order_number": {"$regex": f"^{parent_num}"}})
        client.close()
