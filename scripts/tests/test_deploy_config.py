"""Checks offline del preflight: sólo valores ficticios, sin Docker ni .env."""

import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "check-deploy-config.py"
spec = importlib.util.spec_from_file_location("deploy_config", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeployConfigTests(unittest.TestCase):
    def setUp(self):
        credentials = {"POSTGRES_DB": "test_db", "POSTGRES_USER": "test_user",
                       "POSTGRES_PASSWORD": "fake_password"}
        self.config = {"services": {
            "database": {"environment": credentials, "volumes": [{
                "type": "volume", "source": "postgres_data", "target": "/var/lib/postgresql/data"}]},
            "backend": {"environment": {**credentials, "POSTGRES_HOST": "database",
                "POSTGRES_PORT": "5432", "CLERK_SECRET_KEY": "sk_live_fake_offline",
                "ALLOWED_ORIGINS": "https://supermercado.leacastro.dev"},
                "ports": [{"host_ip": "127.0.0.1", "published": "8000", "target": 8000}]},
            "nginx": {"environment": {"API_SERVER_NAME": "api.supermercado.leacastro.dev"}},
            "certbot": {"environment": {"LETSENCRYPT_EMAIL": "test@invalid.test"}},
        }}

    def test_production_and_internal_only_backend(self):
        self.assertEqual(module.validate(self.config), [])
        self.config["services"]["backend"].pop("ports")
        self.assertEqual(module.validate(self.config), [])

    def test_rejects_unsafe_origins(self):
        for extra in ("*", "http://localhost:5173", "https://localhost", "https://site.test/", "https://site.test/path"):
            with self.subTest(origin=extra):
                config = copy.deepcopy(self.config)
                config["services"]["backend"]["environment"]["ALLOWED_ORIGINS"] += "," + extra
                self.assertTrue(module.validate(config))

    def test_rejects_public_database_and_backend(self):
        for service in ("database", "backend"):
            with self.subTest(service=service):
                config = copy.deepcopy(self.config)
                config["services"][service]["ports"] = [{"host_ip": "0.0.0.0", "target": 8000}]
                self.assertTrue(module.validate(config))

    def test_rejects_wrong_volume(self):
        self.config["services"]["database"]["volumes"][0]["source"] = "other_data"
        self.assertTrue(module.validate(self.config))

    def test_cli_does_not_disclose_mismatched_credentials(self):
        sentinel = "DO_NOT_PRINT_THIS_FAKE_SECRET"
        self.config["services"]["backend"]["environment"]["POSTGRES_PASSWORD"] = sentinel
        result = subprocess.run([sys.executable, str(SCRIPT)], input=json.dumps(self.config),
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(sentinel, result.stdout + result.stderr)
        self.assertIn("POSTGRES_PASSWORD difiere", result.stderr)

    def test_malformed_json_does_not_echo_input(self):
        result = subprocess.run([sys.executable, str(SCRIPT)], input="NOT_JSON_FAKE_SECRET",
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("NOT_JSON_FAKE_SECRET", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
