# IOT BOM List v2 🚀

IOT BOM List is a comprehensive, enterprise-grade Bill of Materials (BOM) and Inventory Management System designed specifically for hardware engineering and IoT device production. It handles everything from component-level tracking to large-scale project deployment estimations with real-time supplier API integrations.

## 🌟 Key Features

- **Neural Auto-Enrichment:** Automatically queries supplier APIs (LCSC, Mouser, DigiKey) during data import to fill in missing prices, market stock, and datasheet links in real-time.
- **Smart Data Injection:** A 4-step import wizard with "Pre-flight Intelligence" that scans Excel files for broken relational dependencies before committing data to the database. Supports legacy `enhanced_master_bom` and `part_database` formats via automated universal column mapping.
- **Hierarchical BOM Export:** Generates clean, production-ready Excel files with multi-level hierarchical numbering (e.g., 1, 1.1, 1.2) grouped by PCB assembly. Includes conditional formatting (Red for Out-of-Stock, Yellow for Swapped parts).
- **Cost-Down Engine:** Intelligently swaps components with cheaper or available alternatives if the primary component is out of stock in the market.
- **Real-Time Financial Analytics:** Instant calculation of estimated costs, missing price warnings, and target quotes (with configurable margins) across all levels of production.

---

## 🏗 Tech Stack

*   **Frontend:** Next.js 14 (React), TailwindCSS, React Query, Lucide Icons, Radix UI.
*   **Backend:** Node.js (ESM), Hono (High-performance framework), Prisma ORM, PostgreSQL.
*   **Sidecar:** Java SDK (for LCSC API bridging).
*   **Infrastructure:** Docker, Docker Compose, GitHub Actions (CI/CD), GitHub Container Registry (GHCR).

---

## 📖 Page-by-Page Breakdown

### 1. Items (Master Inventory)
*   **Capabilities:** Acts as the central nervous system for all electronic components. 
*   **Features:** Real-time search, price lookup button (forces API fetch for the latest stock/price), visual badges for suppliers indicating "Best In-Stock" options, and one-click datasheet access.

### 2. PCBs (Product Assemblies)
*   **Capabilities:** Manages the actual Bill of Materials for a single printed circuit board.
*   **Features:** 
    *   Add/remove components, set quantities.
    *   Upload EDA Pick & Place files (CSV/Excel).
    *   Live cost estimation and "Missing Prices" alerts.
    *   Alternative component management (temporary overrides or permanent swaps).
    *   Export standard or "Cost-Down" (Alternative) BOMs with hierarchical numbering.

### 3. Products (Sets)
*   **Capabilities:** Defines a final sellable hardware product by bundling one or multiple PCB Assemblies.
*   **Features:** Hierarchical composition, cumulative cost tracking, and single-click full product BOM export.

### 4. Projects (Supersets)
*   **Capabilities:** Designed for Sales and Production Managers to plan large-scale deployments.
*   **Features:** 
    *   Bundle multiple Products into a massive deployment project.
    *   **Target Quote Calculator:** Instantly suggests a selling price based on base BOM costs + desired profit margin (default 25%).
    *   **Budget Drainers:** Identifies the top 5 most expensive components consuming the project's budget.
    *   Exports a Master Project BOM Excel file using the standardized single-sheet template.

### 5. System Control (Admin Hub)
*   **Operators:** Manage user access and roles (Admin/User/Super).
*   **Audit Log:** Tracks every single change made in the system (Who, What, When, Old Value, New Value).
*   **Data Import:** The Smart Wizard for Excel injection with Auto-Enrichment and System Health auditing.
*   **Backups:** Automated daily snapshots and manual download/restore capabilities for disaster recovery.

---

## 🚢 Deployment Guide

The system is fully containerized and features a CI/CD pipeline out of the box.

### 1. Local Development
Make sure you have Docker Desktop installed.
```bash
# Clone the repository
git clone https://github.com/GSPETech/IOTBomlist-v2.git
cd IOTBomlist-v2

# Start the environment
docker-compose up --build -d
```
*   Frontend: `http://localhost:3000`
*   Backend API: `http://localhost:8001`
*   Default Login: `jonathan` / `admins`

### 2. Production Deployment (AWS / VPS)
The project uses GitHub Actions to automatically build and push Docker images to GHCR upon every commit to `main`.

**Prerequisites:**
1. Ensure `NEXT_PUBLIC_API_URL` is set in your GitHub Repository Secrets (e.g., `http://YOUR_SERVER_IP:8001`).
2. Server must have Docker and Docker Compose installed.

**Deployment Steps on Server:**
```bash
# 1. Create a project directory
mkdir iotbomlist && cd iotbomlist

# 2. Download the production compose file
curl -O https://raw.githubusercontent.com/GSPETech/IOTBomlist-v2/main/docker-compose.prod.yml

# 3. Create your .env file
nano .env 
# (Fill in DB_PASSWORD, JWT_SECRET, JLC/MOUSER API Keys, and NEXT_PUBLIC_API_URL)

# 4. Login to GitHub Container Registry (Only needed once)
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# 5. Pull the latest images and start the system
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### To Update in Production:
Simply push your code changes to GitHub. Once the Actions build turns green, run this on your server:
```bash
docker-compose -f docker-compose.prod.yml pull && docker-compose -f docker-compose.prod.yml up -d
```

---
*Built with ❤️ for hardware engineering excellence.*
