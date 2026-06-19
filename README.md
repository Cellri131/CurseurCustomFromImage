# Curseur

Les variables CSS `--color1`, `--color2`, etc. permettent de choisir la couleur de chacune des couches du curseur.  
D'autres versions arriveront à l'avenir.

---

## Créer un curseur personnalisé à partir d'une image

### 1. Préparer votre image

Choisissez une première image — elle définit les **dimensions** du curseur.  
Toutes les images utilisées pour les différentes couches doivent posséder **les mêmes proportions**.

---

### 2. Convertir l'image en grille ASCII (PowerShell)

Ouvrez un terminal **PowerShell** (le script peut ne pas fonctionner sous `cmd`), naviguez jusqu'au dossier contenant votre image, puis exécutez les commandes **une par une** :

```powershell
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::new("Lien de votre image")
for ($y = 0; $y -lt $img.Height; $y++) {
    $row = ""
    for ($x = 0; $x -lt $img.Width; $x++) {
        $px = $img.GetPixel($x, $y)
        if ($px.A -gt 10) { $row += "O" } else { $row += "." }
    }
    Write-Host ("{0:D2}: {1}" -f $y, $row)
}
```

> **Note :** Windows peut afficher un avertissement de confirmation avant de coller du code dans le terminal — c'est normal, il s'agit d'une mesure de sécurité.

---

### 3. Résultat attendu

Le script produit une grille ligne par ligne, par exemple :

```
00: ................................................................
01: ................................................................
09: .....................................O..........................
10: ....................................OO..........................
11: ...................................OO...........................
12: ..................................OOO...........................
13: .................................OOOO...........................
14: ................................OOOO............................
15: ...............................OOOOO............................
16: ................OOOOOOO.......OOOOOO............................
17: ................OOOOOOOOOOOOOOOOOOO.............................
18: ................OOOOOOOOOOOOOOOOOOO.............................
19: ................OOOOOOOOOOOOOOOOOOO.............................
20: ................OOOOOOOOOOOOOOOOOOO.............................
21: ................OOOOOOOOOOOOOOOOOOO.............................
22: ................OOOOOOOOOOOOOOOOOOO.............................
23: .................OOOOOOOOOOOOOOOOOO.............................
24: .................OOOOOOOOOOOOOOOOO..............................
25: .................OOOOOOOOOOOOOOOOO..............................
26: .................OOOOOOOOOOOOOOOOO..............................
27: .................OOOOOOOOOOOOOOOOOO.............................
28: .................OOOOOOOOOOOOOOOOOO.............................
29: .................OOOOOOOOOOOOOOOOOO.............................
30: ................OOOOOOOOOOOOOOOOOOO.............................
31: ...............OOOOOOOOOOOOOOOOOOOO.............................
32: ..............OOOOOOOOOOOOOOOOOOOOO.............................
33: .............OOOOOOOOOOOOOOOOOOOOOOO............................
34: ............OOOOOOOOOO....OOOOOOOOOO............................
35: ...........OOOOOO..............OOOOO............................
36: ..........OOO......................O............................
37: .........OO.....................................................
38: ................................................................
63: ................................................................
```

---

### 4. Intégrer le résultat dans `cursor-data.js`

Copiez la grille générée et placez-la dans `cursor-data.js` comme valeur d'une des variables `ascii` :

```javascript
const ascii1 = `\
00: ................................................................
01: ................................................................
63: ................................................................`;
```

---

## Caractères spéciaux dans la grille

| Caractère | Rôle |
|-----------|------|
| `.` | Pixel vide (transparent) |
| `O` | Pixel rempli |
| `X` | Pixel rempli + **délimiteur de segment** (contrôle les courbes) |
| `C` | Pixel rempli (alias de `O`) |
| `D` | Pixel rempli + **segment droit** entre deux `D`, ou entre un `D` et un `X` adjacent (rayon 1) |

### Règles pour `D` (segment droit)

- **Deux `D` dans un même segment** → trait droit entre eux (pas de courbe)
- **`D` directement adjacent à un `X`** (case voisine, `DX` ou `XD`) → segment droit
- `DOX` (avec un `O` entre le `D` et le `X`) → **ne déclenche pas** le segment droit

### Trous intérieurs

Les pixels `.` complètement entourés de `O` créent automatiquement un **trou transparent** dans la forme (rendu via `fill-rule: evenodd`).

---

## Structure des fichiers

| Fichier | Rôle |
|---------|------|
| `cursor.js` | Moteur de rendu (ne pas modifier) |
| `cursor-data.js` | Données ASCII + configuration des couches |
| `copilot.html` | Page de démo (CSS vars + 2 balises `<script>`) |

### Intégrer le curseur sur une autre page

```html
<style>
  :root {
    --size:   180px;
    --color1: #ffaa00;
    --color2: #ff4400;
    --bg:     #1a1a2e;
  }
  html, body { background: var(--bg); }
</style>

<script src="cursor.js"></script>
<script src="cursor-data.js"></script>
```
