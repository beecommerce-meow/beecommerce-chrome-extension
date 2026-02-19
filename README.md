# BeeCommerce — Multi-Supplier Product Pipeline → Shopify

BeeCommerce is a dropshipping operations platform designed to move products from **multiple supplier sources (AliExpress, Amazon research, CSV, APIs) → BeeCommerce → Shopify** through a clean, automated workflow.

Built with **Base44 + Firebase**, BeeCommerce focuses on product normalization, pricing automation, and publishing workflows rather than replacing existing storefront platforms.

---

## 🚀 Overview

BeeCommerce acts as a **product pipeline layer** between:

* Supplier catalogs (AliExpress, Amazon research, CSV feeds, APIs)
* Storefront platforms (Shopify)
* Operational workflows (import → normalize → price → publish → fulfill)

It enables founders to experiment with multiple suppliers while keeping Shopify listings consistent.

---

## ✨ Key Features

### 📦 Multi-Supplier Import

Supports importing products from:

* AliExpress (dropshipping-friendly sourcing)
* Amazon (product research / reference import)
* CSV supplier feeds
* External supplier APIs

BeeCommerce stores supplier references and converts them into a standardized product structure.

---

### 🧠 Product Normalization

Transforms raw supplier data into Shopify-ready format:

* Titles & descriptions
* Media assets
* Variant structures
* Supplier cost tracking
* Source URLs

BeeCommerce becomes the **source of truth** before publishing.

---

### 💰 Pricing Automation

* Markup rules
* Shipping buffers
* Profit preview
* Rounding strategies
* Bulk re-pricing

Pricing logic is applied before publishing to Shopify.

---

### 🛍 Shopify Publishing Adapter

Converts normalized products into Shopify listings:

* Product creation
* Variant mapping
* Media upload
* Inventory policies
* Re-publish & updates

BeeCommerce tracks publish status and links each record to its Shopify product ID.

---

### 📬 Order Operations

* Centralized order dashboard
* Supplier reference per order
* Purchase checklist
* Tracking number management
* Status timeline

Orders flow from Shopify back into BeeCommerce for fulfillment management.

---

## 🧠 Core Concept

BeeCommerce is not a storefront builder or a supplier scraper.

It is a **product pipeline system** that:

1. Imports supplier products
2. Normalizes product data
3. Applies pricing logic
4. Publishes to Shopify
5. Tracks fulfillment workflow

This allows multi-supplier experimentation without locking data to one platform.

---

## 🏗 Architecture

**Frontend / Builder**

* Base44

**Backend / Data**

* Firebase (Auth, Firestore)

**Integrations**

* Shopify Admin API
* Supplier connectors (AliExpress, CSV, manual capture, research imports)

---

## 📊 Data Model (Simplified)

**Product**

* Source (AliExpress / Amazon / CSV / API)
* Supplier URL
* Cost
* Normalized data
* Pricing result
* Shopify product ID
* Status

**Order**

* Shopify order ID
* Supplier reference
* Fulfillment status
* Tracking info

This separation enables re-pricing, re-publishing, and multi-store workflows.

---

## 🔐 Security Approach

* Firebase authentication
* Owner-scoped data
* Environment-based integrations
* Template/demo builds use separate projects
* No supplier credentials included in public versions

---

## 🧪 Project Status

Active personal MVP focused on:

* Multi-supplier product pipelines
* Pricing automation
* Publishing workflows
* Fulfillment visibility

---

## 🗺 Roadmap

* Supplier connector expansion
* Background job queue
* Bulk automation rules
* Analytics layer
* Team roles & permissions
* Public template modules

---

## 📸 Demo

Live demo available via Base44 publish link.
Screenshots and workflow walkthrough included in this repository.

---

## ☕ Support

If you find BeeCommerce interesting, you can support development via Ko-fi.

---

## 📄 License

This repository is for showcase and educational purposes.
Core production logic and integrations are not fully open-sourced.

Users are responsible for complying with supplier platform policies and regional regulations when adapting workflows.

---

<img width="1495" height="801" alt="Screenshot 2026-02-15 203250" src="https://github.com/user-attachments/assets/cbdecd6f-3879-41d9-b1f0-115d0de4e6cf" />
<img width="1488" height="793" alt="Screenshot 2026-02-15 203303" src="https://github.com/user-attachments/assets/91fe50c3-dcbe-49d4-bbb1-80dfcac09f2d" />
<img width="1470" height="792" alt="Screenshot 2026-02-15 203828" src="https://github.com/user-attachments/assets/ae87ef81-b129-4eaa-9d1a-4b936a1dc427" />
<img width="1515" height="806" alt="Screenshot 2026-02-15 203409" src="https://github.com/user-attachments/assets/bdc83731-5c36-4202-bcdd-6953f992a49f" />
