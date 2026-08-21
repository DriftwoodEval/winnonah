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
        packages = [ pkgs.tesseract ];
      };
    };
}
