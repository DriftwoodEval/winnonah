{
  description = "Dev environment for winnonah";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        # python/utils/document_categorizer.py shells out to this via
        # pytesseract at runtime.
        packages = [
          pkgs.tesseract
          pkgs.chromium
          pkgs.chromedriver
        ];

        # Selenium (python/utils/webdriving.py) otherwise falls back to
        # Selenium Manager's auto-downloaded chromedriver, which is a generic
        # Linux binary that can't find its shared libraries on NixOS.
        CHROME_BIN = "${pkgs.chromium}/bin/chromium";
        CHROMEDRIVER_PATH = "${pkgs.chromedriver}/bin/chromedriver";
      };
    };
}
