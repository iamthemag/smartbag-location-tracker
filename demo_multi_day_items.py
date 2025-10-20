#!/usr/bin/env python3
"""
Demo: Multi-Day Item Handling Comparison
Shows the difference between original and improved approaches
"""

def demo_original_approach():
    """Shows how the original script handles multi-day items"""
    print("🔸 ORIGINAL APPROACH:")
    print("-" * 40)
    
    # Example: User has laptop on Monday, Wednesday, Friday
    items = {
        "Monday": ["Laptop", "Phone"],
        "Tuesday": ["Notebook"],
        "Wednesday": ["Laptop", "Water Bottle"],
        "Thursday": ["USB Drive"],
        "Friday": ["Laptop", "Documents"],
        "Saturday": ["Books"],
        "Sunday": []
    }
    
    total_qr_codes = 0
    qr_codes_generated = []
    
    for day, day_items in items.items():
        for item in day_items:
            qr_text = f"{day}:{item}"
            qr_filename = f"{day}_{item.replace(' ', '_')}.png"
            qr_codes_generated.append((qr_filename, qr_text))
            total_qr_codes += 1
    
    print(f"📊 Results:")
    print(f"  • Total QR codes generated: {total_qr_codes}")
    print(f"  • Storage space used: {total_qr_codes} files")
    
    print(f"\n📄 QR Codes for 'Laptop' (appears 3 times):")
    laptop_qrs = [qr for qr in qr_codes_generated if "Laptop" in qr[1]]
    for filename, qr_text in laptop_qrs:
        print(f"  • {filename} → {qr_text}")
    
    print(f"\n❗ Issues:")
    print(f"  • Laptop appears 3 times with different QR codes")
    print(f"  • User needs 3 different QR stickers for the same item")
    print(f"  • Confusing for users - which QR code to scan?")

def demo_improved_approach():
    """Shows how the improved script handles multi-day items"""
    print("\n🔹 IMPROVED APPROACH:")
    print("-" * 40)
    
    from collections import defaultdict
    
    # Same example data
    items = {
        "Monday": ["Laptop", "Phone"],
        "Tuesday": ["Notebook"],
        "Wednesday": ["Laptop", "Water Bottle"],
        "Thursday": ["USB Drive"],
        "Friday": ["Laptop", "Documents"],
        "Saturday": ["Books"],
        "Sunday": []
    }
    
    # Analyze item usage
    item_usage = defaultdict(list)
    for day, day_items in items.items():
        for item in day_items:
            item_usage[item].append(day)
    
    # Categorize items
    unique_items = {}
    shared_items = {}
    
    for item, days in item_usage.items():
        if len(days) == 1:
            unique_items[item] = days[0]
        else:
            shared_items[item] = days
    
    # Generate QR codes
    total_qr_codes = len(unique_items) + len(shared_items)
    
    print(f"📊 Analysis Results:")
    print(f"  • Unique items (single day): {len(unique_items)}")
    print(f"  • Shared items (multi-day): {len(shared_items)}")
    print(f"  • Total QR codes needed: {total_qr_codes}")
    print(f"  • Storage space saved: {sum(len(days)-1 for days in shared_items.values())} files")
    
    print(f"\n🔄 Multi-day items detected:")
    for item, days in shared_items.items():
        days_str = ", ".join(days)
        print(f"  • {item} → Used on: {days_str}")
        print(f"    QR Code: SHARED:{item} (single code for all days)")
    
    print(f"\n📱 Single-day items:")
    for item, day in unique_items.items():
        print(f"  • {item} → {day} only")
        print(f"    QR Code: {day}:{item}")
    
    print(f"\n✅ Benefits:")
    print(f"  • Laptop gets ONE QR code for all 3 days")
    print(f"  • User sticks one QR code on laptop")
    print(f"  • Clear in PDF: Blue items = multi-day use")
    print(f"  • Reduced confusion and storage space")

def main():
    print("=" * 60)
    print("🎒 Multi-Day Item Handling: Original vs Improved")
    print("=" * 60)
    
    demo_original_approach()
    demo_improved_approach()
    
    print(f"\n" + "=" * 60)
    print("📋 SUMMARY COMPARISON:")
    print("=" * 60)
    
    print("📊 Example scenario: Laptop used Mon, Wed, Fri")
    print()
    print("🔸 Original Approach:")
    print("  • Creates 3 QR codes: Monday_Laptop.png, Wednesday_Laptop.png, Friday_Laptop.png")
    print("  • QR codes contain: 'Monday:Laptop', 'Wednesday:Laptop', 'Friday:Laptop'")
    print("  • User confusion: Which QR code to put on laptop?")
    print()
    print("🔹 Improved Approach:")
    print("  • Creates 1 QR code: SHARED_Laptop.png")
    print("  • QR code contains: 'SHARED:Laptop'")
    print("  • PDF shows laptop in blue on Mon/Wed/Fri rows")
    print("  • Clear user experience: One sticker per item")
    
    print(f"\n🚀 To use the improved version:")
    print(f"  python3 configure-bag-items-improved.py")

if __name__ == "__main__":
    main()