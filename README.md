# BeeCommerce — Multi-Supplier → Shopify

Link
<img width="1495" height="801" alt="Screenshot 2026-02-15 203250" src="https://github.com/user-attachments/assets/cbdecd6f-3879-41d9-b1f0-115d0de4e6cf" />


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

<img width="1470" height="792" alt="Screenshot 2026-02-15 203828" src="https://github.com/user-attachments/assets/ae87ef81-b129-4eaa-9d1a-4b936a1dc427" />
---

### 🛍 Shopify Publishing Adapter

Converts normalized products into Shopify listings:

* Product creation
* Variant mapping
* Media upload
* Inventory policies
* Re-publish & updates

BeeCommerce tracks publish status and links each record to its Shopify product ID.


## 🏗 Architecture

**Frontend / Builder**

* Base44

**Backend / Data**

* Firebase (Auth, Firestore)

**Integrations**

* Shopify Admin API
* Supplier connectors (AliExpress, CSV, manual capture, research imports)



## 📸 Demo

Live demo available via Base44 publish link.
Screenshots and workflow walkthrough included in this repository.

---

## ☕ Support

If you find BeeCommerce interesting, you can support development via Ko-fi.

---


<img width="1488" height="793" alt="Screenshot 2026-02-15 203303" src="https://github.com/user-attachments/assets/91fe50c3-dcbe-49d4-bbb1-80dfcac09f2d" />

<img width="1515" height="806" alt="Screenshot 2026-02-15 203409" src="https://github.com/user-attachments/assets/bdc83731-5c36-4202-bcdd-6953f992a49f" />
