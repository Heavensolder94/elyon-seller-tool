import csv

def berechne_preis(einkauf, versand, marge):
    ebay_gebuehr = 0.13  # ca. 13%
    verkaufspreis = (einkauf + versand) / (1 - ebay_gebuehr - marge)
    gewinn = verkaufspreis * marge
    return round(verkaufspreis, 2), round(gewinn, 2)

def generiere_titel(name):
    return f"{name} | Top Qualität | Schneller Versand | Neu"

def generiere_beschreibung(name):
    return f"""
Produkt: {name}

✔ Hochwertige Qualität  
✔ Schneller Versand  
✔ Zufriedene Kunden  

Jetzt bestellen!
"""

name = input("Produktname: ")
einkauf = float(input("Einkaufspreis (€): "))
versand = float(input("Versandkosten (€): "))
marge = float(input("Gewünschte Marge (z.B. 0.2 für 20%): "))

preis, gewinn = berechne_preis(einkauf, versand, marge)
titel = generiere_titel(name)
beschreibung = generiere_beschreibung(name)

print("\n--- Ergebnis ---")
print("Verkaufspreis:", preis, "€")
print("Gewinn:", gewinn, "€")
print("Titel:", titel)
print("Beschreibung:", beschreibung)

with open("output.csv", "w", newline="", encoding="utf-8") as file:
    writer = csv.writer(file)
    writer.writerow(["Name", "Preis", "Gewinn", "Titel", "Beschreibung"])
    writer.writerow([name, preis, gewinn, titel, beschreibung])

print("\nCSV-Datei wurde erstellt!")