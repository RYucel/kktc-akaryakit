from pathlib import Path
import unittest
from unittest.mock import patch

from scripts.gazete import discover, parse_page, latest

SOURCE = {"url": "https://basimevi.gov.ct.tr/Portals/6/2026/169.pdf", "yayinTarihi": "2026-09-10", "gazeteNo": 169}
TEXT = (Path(__file__).parent / "fixtures/rg-169-price.txt").read_text(encoding="utf-8")


class GazetteTests(unittest.TestCase):
    def test_actual_ordinance_and_effective_date(self):
        price = parse_page(TEXT, SOURCE, 35)
        self.assertEqual(price["tarih"], "2026-09-11")
        self.assertEqual([price["urunler"][key]["resmiPompa"] for key in ["b95", "b98", "dz"]], [71.12, 72.12, 70.0])
        self.assertEqual(price["urunler"]["dz"]["resmiIAF"], 59.322034)
        self.assertEqual(price["kaynak"]["sayfa"], 35)

    def test_missing_or_ambiguous_product_fails(self):
        for text in [TEXT.replace("70,00", "?"), TEXT.replace("Euro Diesel 59,322034", "Unknown 59,322034"), TEXT.replace("70,00", "-70,00")]:
            with self.subTest(text=text[-100:]):
                with self.assertRaises(ValueError):
                    parse_page(text, SOURCE, 35)

    def test_missing_effective_date_never_uses_repealed_date(self):
        with self.assertRaises(ValueError):
            parse_page(TEXT.replace("11 .09.2026", "belirsiz"), SOURCE, 35)

    def test_date_validation(self):
        with self.assertRaises(ValueError):
            parse_page(TEXT.replace("11 .09.2026", "31 .09.2026"), SOURCE, 35)

    def test_unrelated_page_is_not_a_price_table(self):
        self.assertIsNone(parse_page("Fiyat istikrar fonu 0,176095 TL/Lt", SOURCE, 34))

    def test_nested_index_selects_fuel_only_and_sorts_by_date(self):
        html = '''<table>
        <tr><td><a href="/Portals/6/2026/168.pdf">168</a></td><td>08.09.2026</td><td>Atama</td></tr>
        <tr><td><a href="/Portals/6/2026/169.pdf">169</a></td><td>10.09.2026</td><td><table><tr><td>BENZİN EURO DİESEL AZAMİ SATIŞ FİYATLARI</td></tr></table></td></tr>
        <tr><td><a href="/Portals/6/2026/170.pdf">170</a></td><td>17.09.2026</td><td>BENZİN EURO DİESEL AZAMİ SATIŞ FİYATLARI</td></tr>
        </table>'''
        sources = discover(html, "2026-09-11")
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["gazeteNo"], 169)

    def test_changed_index_fails_instead_of_fabricating_prices(self):
        with self.assertRaises(ValueError):
            discover("<html>Bakım</html>", "2026-09-11")

    @patch("scripts.gazete.download", return_value=b"index")
    @patch("scripts.gazete.discover", return_value=[SOURCE, SOURCE])
    @patch("scripts.gazete.parse_pdf")
    def test_not_yet_effective_ordinance_is_skipped(self, parse, _discover, _download):
        parse.side_effect = [{"tarih": "2026-09-18"}, {"tarih": "2026-09-11"}]
        self.assertEqual(latest("2026-09-17")["tarih"], "2026-09-11")

    @patch("scripts.gazete.download", return_value=b"index")
    @patch("scripts.gazete.discover", return_value=[SOURCE, SOURCE])
    @patch("scripts.gazete.parse_pdf", side_effect=ValueError("unreadable"))
    def test_unreadable_new_ordinance_does_not_silently_skip_to_old(self, _parse, _discover, _download):
        with self.assertRaises(ValueError):
            latest("2026-09-18")


if __name__ == "__main__":
    unittest.main()
